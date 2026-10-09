import { parseTime } from './time.mjs';
import { MAX_BYTES, MAX_ROWS, MAX_CELLS } from './limits.mjs';
// Parsing and panel calculations are shared by every view. No source rows are mutated.
export function parseCSV(text, delimiter = ',') {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('File limit: 10 MB.');
  const rows = [];
  let row = [], field = '', quoted = false, endedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; endedQuote = true; }
      else field += char;
    } else if (char === '"') {
      if (field || endedQuote) throw new Error('CSV 引号格式不正确。');
      quoted = true;
    } else if (char === delimiter || char === '\n' || char === '\r') {
      row.push(field); field = ''; endedQuote = false;
      if (char !== delimiter) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (row.some(value => value.trim() !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (endedQuote) throw new Error('CSV 引号后应为分隔符或换行。');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV 中有未闭合的引号。');
  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 需要表头和至少一行数据。');
  const headers = rows.shift().map(value => value.trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) throw new Error('列名不能为空或重复。');
  if (rows.some(values => values.length !== headers.length)) throw new Error('CSV 各行的列数不一致。');
  if (rows.length > MAX_ROWS) throw new Error('Limit: 100,000 records.');
  return { headers, rows: rows.map(values => Object.fromEntries(headers.map((name, index) => [name, values[index]]))) };
}

const missing = value => /^(?:|na|nan|null)$/i.test(String(value).trim());
const unsafeInteger = value => Number.isInteger(value) && !Number.isSafeInteger(value);
export const panelKey = (entity, time) => JSON.stringify([entity, time]);

// Representation is not measurement scale: 0/1 and small integer codes may be categories.
export function columnTypes(parsed) {
  return parsed.headers.map(name => {
    const values = parsed.rows.map(row => String(row[name] ?? '').trim()).filter(value => !missing(value));
    let type = 'typeText';
    if (!values.length) type = 'typeEmpty';
    else if (values.every(value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))) type = 'typeUuid';
    else if (values.every(value => /^(true|false)$/i.test(value))) type = 'typeBoolText';
    else if (values.every(value => Number.isFinite(Number(value)))) {
      if (values.some(value => unsafeInteger(Number(value)))) type = 'typeLargeInteger';
      else if (values.some(value => /^[+-]?0\d+$/.test(value))) type = 'typeZeroCode';
      else if (values.every(value => [0,1].includes(Number(value)))) type = 'typeBinary';
      else if (values.some(value => /e[+-]?\d+$/i.test(value))) type = 'typeScientific';
      else if (values.every(value => Number.isInteger(Number(value)))) type = 'typeInteger';
      else type = 'typeDecimal';
    } else if (values.every(value => /^[+-]?[\d.,]+\s*%$/.test(value))) type = 'typePercent';
    else if (values.some(value => /[$€£¥]|\d[, ]\d|^\([\d.,]+\)$/.test(value))) type = 'typeFormatted';
    else if (values.some(value => Number.isFinite(Number(value)))) type = 'typeMixed';
    return {name,type,missing:parsed.rows.length-values.length};
  });
}

export function buildPanel(parsed, entityColumn, timeColumn, variables, {timeFormat = 'number', kind = 'panel'} = {}) {
  const cross = kind === 'cross-section';
  if (!entityColumn || (!cross && (!timeColumn || entityColumn === timeColumn))) throw new Error('请选择不同的个体列和时间列。');
  if (![entityColumn, ...(cross ? [] : [timeColumn]), ...variables].every(name => parsed.headers.includes(name))) throw new Error('选择的列不在 CSV 中。');
  if (!variables.length || variables.some(name => name === entityColumn || name === timeColumn)) throw new Error('请至少选择一个独立的数值变量。');
  const entities = [], entitySet = new Set(), times = new Set(), records = new Map(), timeLabels = new Map();
  if (parsed.rows.length > MAX_ROWS) throw new Error('Limit: 100,000 records.');
  let missingValues = 0;
  for (const source of parsed.rows) {
    const entity = source[entityColumn].trim();
    const rawTime = cross ? '0' : source[timeColumn].trim();
    if (!entity || !rawTime) throw new Error('个体和时间键不能缺失。');
    const {key:time, label} = parseTime(rawTime, cross ? 'number' : timeFormat);
    timeLabels.set(time, cross ? '' : label);
    const key = panelKey(entity, time);
    if (records.has(key)) throw new Error(`重复面板键：${entity}${cross ? '' : ' / ' + label}。请先明确记录粒度；不会自动求平均。`);
    const values = Object.create(null);
    for (const variable of variables) {
      const raw = source[variable];
      const value = missing(raw) ? null : Number(raw);
      if (value !== null && !Number.isFinite(value)) throw new Error(`“${variable}”包含非数值：${raw}`);
      if (value !== null && unsafeInteger(value)) throw new Error(`Unsafe integer magnitude in variable: ${variable}. Use it as a text key or deselect it.`);
      if (value === null) missingValues++;
      values[variable] = value;
    }
    records.set(key, { entity, time, values });
    if (!entitySet.has(entity)) { entities.push(entity); entitySet.add(entity); }
    times.add(time);
  }
  const sortedTimes = [...times].sort((a, b) => a - b);
  if (entities.length * sortedTimes.length * variables.length > MAX_CELLS) throw new Error('Panel exceeds 2,000,000 cells.');
  const ranges = Object.fromEntries(variables.map(variable => {
    const values = [...records.values()].map(record => record.values[variable]).filter(value => value !== null);
    return [variable, { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 1 }];
  }));
  return { entities, times: sortedTimes, timeLabels, timeFormat:cross ? null : timeFormat, kind, variables, records, ranges, entityColumn, timeColumn:cross ? null : timeColumn,
    rowCount: parsed.rows.length, missingValues, absentRecords: entities.length * sortedTimes.length - records.size };
}

export function cell(panel, entity, time, variable) {
  const record = panel.records.get(panelKey(entity, time));
  return { value: record ? record.values[variable] : null, absent: !record };
}

export function seriesFor(panel, variable, entities, start, end, aggregation = 'none') {
  if (!['none', 'sum', 'mean'].includes(aggregation)) throw new Error('未知的汇总方式。');
  const times = panel.times.filter(time => time >= start && time <= end);
  if (aggregation === 'none') return entities.map(entity => ({ name: entity, entity,
    points: times.map(time => ({ time, ...cell(panel, entity, time, variable), n: cell(panel, entity, time, variable).value === null ? 0 : 1 })) }));
  if (!entities.length) return [];
  return [{ name: aggregation === 'sum' ? '所选企业 · 总和' : '所选企业 · 均值', entity: null,
    points: times.map(time => {
      const values = entities.map(entity => cell(panel, entity, time, variable).value).filter(value => value !== null);
      const sum = values.reduce((total, value) => total + value, 0);
      return { time, value: values.length ? (aggregation === 'mean' ? sum / values.length : sum) : null, n: values.length };
    }) }];
}

export function numericColumns(parsed, excluded = []) {
  return parsed.headers.filter(name => !excluded.includes(name) && parsed.rows.some(row => !missing(row[name]))
    && parsed.rows.every(row => missing(row[name]) || Number.isFinite(Number(row[name]))));
}
