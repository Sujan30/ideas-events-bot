import { extractEvent } from './extractEvent.js';
import { resolveEventDate } from './resolveDate.js';
import { log } from './log.js';

const EVENT_HINT_PATTERN = /[\u{1F4C5}\u{1F4CD}\u{1F4CC}]/u;
const WRITABLE_KINDS = ['announcement', 'reschedule'];

export function looksLikeEventMessage(content) {
  return EVENT_HINT_PATTERN.test(content) && content.length > 20;
}

function isWritable(date, postedAt) {
  const sameYearAsNow = date.slice(0, 4) === String(new Date().getUTCFullYear());
  const lead = (new Date(date) - new Date(postedAt.slice(0, 10))) / 86400000;
  return sameYearAsNow && lead >= -1;
}

export async function processAnnouncement(message, sheet, llm) {
  const content = message.content?.trim();
  if (!content || !looksLikeEventMessage(content)) {
    log('ignore', 'no event marker emoji (📅 📍 📌) or too short', {
      messageId: message.id,
      length: content?.length ?? 0,
      attachments: message.attachments?.size ?? 0,
      embeds: message.embeds?.length ?? 0,
    });
    return 'ignored';
  }

  const postedAt = message.createdAt.toISOString();
  log('extract', 'sending to LLM', { messageId: message.id, model: llm.model, postedAt, length: content.length });
  const started = Date.now();
  const x = await extractEvent({ ...llm, messageText: content, postedAt });
  log('extract', 'LLM result', { messageId: message.id, ms: Date.now() - started, extracted: x });

  if (!x.isEvent || !WRITABLE_KINDS.includes(x.eventKind) || !x.title) {
    const removed = await sheet.deleteEventByMessageId(message.id);
    log('skip', 'not a writable event', {
      messageId: message.id,
      isEvent: x.isEvent,
      eventKind: x.eventKind,
      hasTitle: !!x.title,
      removedExistingRow: removed,
    });
    return 'skipped';
  }

  const { date, reason } = resolveEventDate(x, postedAt);
  log('date', 'resolved', { messageId: message.id, date, reason, dateText: x.dateText, weekdayStated: x.weekdayStated });
  if (!date || !isWritable(date, postedAt)) {
    const removed = await sheet.deleteEventByMessageId(message.id);
    log('skip', 'date rejected', {
      messageId: message.id,
      reason: reason ?? (date ? 'not this year or already past' : 'unresolvable'),
      date,
      removedExistingRow: removed,
    });
    return 'skipped';
  }

  const event = {
    messageId: message.id,
    postedAt: postedAt.slice(0, 16).replace('T', ' '),
    title: x.title,
    location: x.location,
    date,
    startTime: x.startTime,
    endTime: x.endTime,
    description: x.description,
    rsvpUrl: /^https?:\/\//.test(x.rsvpUrl || '') ? x.rsvpUrl : '',
  };

  log('write', 'event ready', { event });
  const updated = await sheet.updateEventByMessageId(message.id, event);
  if (!updated) await sheet.appendEvent(event);

  const written = await sheet.verifyEventWritten(message.id);
  if (!written) {
    throw new Error(`wrote event for message ${message.id} but could not find it in the sheet afterwards`);
  }
  log('write', 'verified in sheet', {
    messageId: message.id,
    action: updated ? 'updated' : 'appended',
    row: written.rowNumber,
    values: written.values,
  });
  return 'published';
}
