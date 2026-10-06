const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You extract event details from Discord messages posted by a university club (IDEAS Club at SJSU).

You are given MESSAGE_POSTED_AT: when the message was posted. Messages can be old. Do NOT compute calendar dates yourself; only copy what the message says.

Return ONLY a JSON object with these exact keys (no markdown, no commentary):
{
  "isEvent": boolean,
  "eventKind": "announcement" | "reminder" | "recap" | "reschedule" | "none",
  "title": string,            // short event title, no emoji
  "location": string,
  "dateText": string,         // the date phrase copied VERBATIM from the message, "" if none
  "weekdayStated": string,    // weekday named in the message, e.g. "Wednesday", "" if none
  "month": number | null,     // 1-12 if a month is written, else null
  "day": number | null,       // 1-31 if a day of month is written, else null
  "year": number | null,      // only if a four-digit year is written, else null
  "relativeTerm": string,     // "today", "tonight", "tomorrow", "this <weekday>", "next <weekday>", or ""
  "startTime": string,        // e.g. "4:00 PM", "" if not given
  "endTime": string,          // e.g. "6:00 PM", "" if not given
  "rsvpUrl": string,          // a registration/RSVP link starting with http, else ""
  "description": string       // 1-3 sentence plain-text summary, no newlines
}

Rules:
- eventKind "announcement": a new upcoming event with date details.
- eventKind "reschedule": moves a previously announced event to a new date.
- eventKind "reminder": a day-of or day-before nudge for an event already announced ("SVIC is Today!").
- eventKind "recap": past tense, thanks, or summarizes an event that already happened.
- eventKind "none": not about an event (chat, office hours, applications opening).
- Only "announcement" and "reschedule" can have isEvent true.
- Copy dateText verbatim. Put the month, day, and year exactly as written; do not convert them.
- If a field cannot be determined, use an empty string or null rather than guessing.`;

export async function extractEvent({ apiKey, model, messageText, postedAt }) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `MESSAGE_POSTED_AT: ${postedAt}\n\nMESSAGE:\n"""\n${messageText}\n"""` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenRouter response had no content');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model output as JSON: ${raw}`);
  }
}
