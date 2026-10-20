// Timestamped, tagged log lines: `2026-10-19T18:25:19.259Z [tag] message {"k":"v"}`
function format(tag, message, fields) {
  const extra = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
  return `${new Date().toISOString()} [${tag}] ${message}${extra}`;
}

export const log = (tag, message, fields) => console.log(format(tag, message, fields));
export const warn = (tag, message, fields) => console.warn(format(tag, message, fields));

export function logError(tag, message, err, fields) {
  console.error(format(tag, message, { ...fields, error: err?.message }));
  // googleapis errors carry the useful detail (HTTP status, reason) on these fields
  const status = err?.code ?? err?.response?.status;
  const detail = err?.response?.data?.error;
  if (status || detail) console.error(format(tag, 'error detail', { status, detail }));
  if (err?.stack) console.error(err.stack);
}
