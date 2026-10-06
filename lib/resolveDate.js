const MAX_LEAD_DAYS = 120;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 86400000;

function utcMidnight(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(a, b) {
  return Math.round((a - b) / DAY_MS);
}

function resolveRelative(term, postDay) {
  const t = term.toLowerCase().trim();
  if (t === 'today' || t === 'tonight') return postDay;
  if (t === 'tomorrow') return new Date(postDay.getTime() + DAY_MS);

  const match = t.match(/^(this|next)\s+(\w+)$/);
  if (!match) return null;
  const target = WEEKDAYS.indexOf(match[2]);
  if (target < 0) return null;

  let ahead = (target - postDay.getUTCDay() + 7) % 7 || 7;
  if (match[1] === 'next') ahead += 7;
  return new Date(postDay.getTime() + ahead * DAY_MS);
}

function resolveMonthDay(x, postDay) {
  const postYear = postDay.getUTCFullYear();
  const years = x.year ? [x.year] : [postYear, postYear + 1];
  const wanted = WEEKDAYS.indexOf(String(x.weekdayStated || '').toLowerCase().trim());

  const dates = years
    .map(y => new Date(Date.UTC(y, x.month - 1, x.day)))
    .filter(c => c.getUTCMonth() === x.month - 1)
    .filter(c => daysBetween(c, postDay) >= 0);

  if (wanted >= 0) {
    return dates.find(c => c.getUTCDay() === wanted) ?? null;
  }

  return dates
    .filter(c => daysBetween(c, postDay) <= MAX_LEAD_DAYS)
    .sort((a, b) => daysBetween(a, postDay) - daysBetween(b, postDay))[0] ?? null;
}

export function resolveEventDate(x, postedAt) {
  const postDay = utcMidnight(new Date(postedAt));

  let resolved = null;
  if (x.relativeTerm) {
    resolved = resolveRelative(x.relativeTerm, postDay);
  } else if (x.month && x.day) {
    resolved = resolveMonthDay(x, postDay);
  }

  if (!resolved) {
    return { date: null, reason: x.weekdayStated ? `no year matches ${x.weekdayStated}` : 'unresolvable date' };
  }

  const lead = daysBetween(resolved, postDay);
  if (lead < 0) {
    return { date: null, reason: `resolved date ${lead} days from posting` };
  }

  if (x.weekdayStated) {
    const wanted = WEEKDAYS.indexOf(x.weekdayStated.toLowerCase().trim());
    if (wanted >= 0 && wanted !== resolved.getUTCDay()) {
      return {
        date: null,
        reason: `weekday mismatch: message says ${x.weekdayStated}, ${resolved.toISOString().slice(0, 10)} is ${WEEKDAYS[resolved.getUTCDay()]}`,
      };
    }
  }

  return { date: resolved.toISOString().slice(0, 10), reason: null };
}
