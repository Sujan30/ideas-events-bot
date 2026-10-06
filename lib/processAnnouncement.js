import { extractEvent } from './extractEvent.js';
import { resolveEventDate } from './resolveDate.js';

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
  if (!content || !looksLikeEventMessage(content)) return 'ignored';

  const postedAt = message.createdAt.toISOString();
  const x = await extractEvent({ ...llm, messageText: content, postedAt });

  if (!x.isEvent || !WRITABLE_KINDS.includes(x.eventKind) || !x.title) {
    await sheet.deleteEventByMessageId(message.id);
    console.log(`[skip] ${message.id} kind=${x.eventKind}`);
    return 'skipped';
  }

  const { date, reason } = resolveEventDate(x, postedAt);
  if (!date || !isWritable(date, postedAt)) {
    await sheet.deleteEventByMessageId(message.id);
    console.log(`[skip] ${message.id} ${reason ?? 'not this year'}`);
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

  const updated = await sheet.updateEventByMessageId(message.id, event);
  if (!updated) await sheet.appendEvent(event);
  return 'published';
}
