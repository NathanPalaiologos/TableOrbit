// Time keys are sortable numbers; labels retain frequency and never imply imputation.
export const TIME_FORMATS = ['number', 'date', 'month', 'quarter', 'timestamp', 'dmy', 'mdy'];

function calendar(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Invalid calendar date.');
  return date.getTime();
}

export function parseTime(raw, format = 'number') {
  const text = String(raw).trim();
  const fail = () => { throw new Error(`Invalid ${format} time: ${text}`); };
  if (!text || !TIME_FORMATS.includes(format)) return fail();
  if (format === 'number') {
    const key = Number(text);
    if (!Number.isFinite(key)) return fail();
    return {key, label:String(key)};
  }
  let match, key;
  if (format === 'date' && (match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
    key = calendar(+match[1], +match[2], +match[3]);
  } else if (format === 'month' && (match = /^(\d{4})-(\d{2})$/.exec(text))) {
    key = calendar(+match[1], +match[2], 1);
  } else if (format === 'quarter' && (match = /^(\d{4})-Q([1-4])$/.exec(text))) {
    key = calendar(+match[1], (+match[2] - 1) * 3 + 1, 1);
  } else if (['dmy', 'mdy'].includes(format) && (match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text))) {
    key = calendar(+match[3], +match[format === 'dmy' ? 2 : 1], +match[format === 'dmy' ? 1 : 2]);
  } else if (format === 'timestamp' && (match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(text))) {
    calendar(+match[1], +match[2], +match[3]);
    const zone = match[7];
    if (+match[4] > 23 || +match[5] > 59 || +match[6] > 59 || zone === '-00:00' || (zone !== 'Z' && (+zone.slice(1,3) > 23 || +zone.slice(4) > 59))) return fail();
    key = Date.parse(text);
  } else return fail();
  if (!Number.isFinite(key)) return fail();
  const iso = new Date(key).toISOString();
  const label = format === 'timestamp' ? iso : format === 'month' ? iso.slice(0,7) : format === 'quarter' ? text : iso.slice(0,10);
  return {key, label};
}

export const timeLabel = (panel, key) => panel.kind === 'cross-section' ? '' : panel.timeLabels?.get(key) ?? String(key);
