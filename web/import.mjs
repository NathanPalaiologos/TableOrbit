import { parseCSV, buildPanel } from './data.mjs';
import { MAX_BYTES, MAX_ROWS, MAX_CELLS } from './limits.mjs';

// Keep number tokens separate from strings until each cell is formatted.
// This preserves numeric types and large IDs inside nested JSON cells too.
class JSONNumber {
  constructor(source){this.source=source;}
}
function jsonCell(value){
  if(value instanceof JSONNumber)return value.source;
  if(value===null || typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(jsonCell).join(',')+']';
  return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+jsonCell(item)).join(',')+'}';
}

export function detectDelimiter(text) {
  const counts=new Map([[',',0],['\t',0],[';',0],['|',0]]);
  let quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"')i++;else quoted=!quoted; }
    else if(!quoted) { if(c==='\r'||c==='\n')break;if(counts.has(c))counts.set(c,counts.get(c)+1); }
  }
  return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
}

export function decodeText(bytes) {
  const encoding=bytes[0]===255 && bytes[1]===254?'utf-16le':bytes[0]===254 && bytes[1]===255?'utf-16be':'utf-8';
  try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  catch{throw new Error('Unsupported text encoding. Save the file as UTF-8 or UTF-16 with a BOM.');}
}

export function parseFile(text, name) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('File limit: 10 MB.');
  const extension = name.split('.').at(-1).toLowerCase();
  if (['csv','tsv','tab','txt','psv'].includes(extension)) return parseCSV(text, ['tsv','tab'].includes(extension) ? '\t' : detectDelimiter(text));
  if (!['json', 'jsonl', 'ndjson'].includes(extension)) throw new Error('Supported formats: CSV, TSV, JSON, JSONL, NDJSON.');
  text = text.replace(/^\uFEFF/, '');
  // Retain numeric tokens as text before key selection. Modern runtimes expose
  // the original token even when converting it to Number would lose precision.
  const decode = source => JSON.parse(source, (key,value,context) => {
    if (typeof value !== 'number') return value;
    if (!Number.isFinite(value)) throw new Error('Nonfinite JSON number.');
    if (context?.source) return new JSONNumber(context.source);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('Quote large JSON numbers as strings in this browser.');
    return new JSONNumber(String(value));
  });
  const decoded = extension === 'json' ? decode(text) : text.split(/\r?\n/).filter(line => line.trim()).map(decode);
  const values=extension==='json' && decoded && !Array.isArray(decoded) && typeof decoded==='object' && !(decoded instanceof JSONNumber)?[decoded]:decoded;
  if (!Array.isArray(values) || values.length > MAX_ROWS) throw new Error('Expected up to 100,000 JSON records.');
  const headers = [];
  for (const row of values) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || row instanceof JSONNumber) throw new Error('Each JSON record must be an object.');
    for (const [key, value] of Object.entries(row)) {
      if (!key.trim()) throw new Error('Column names cannot be empty.');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Nonfinite JSON number: ${key}`);
      if (!headers.includes(key)) headers.push(key);
    }
  }
  if(headers.length*values.length>MAX_CELLS)throw new Error('Table exceeds 2,000,000 cells.');
  return {headers, rows:values.map(row => Object.fromEntries(headers.map(key => [key, !Object.hasOwn(row,key) || row[key] == null ? '' : typeof row[key]==='object'?jsonCell(row[key]):String(row[key])])))};
}

// Wide-series columns are entities measuring ONE common variable, explicitly chosen by the user.
export function importTable(parsed, {mode = 'panel', entity, time, variables, timeFormat = 'number', entityName, measure, rowId = false}) {
  if (mode === 'cross-section' && rowId) {
    let key = '__row';
    while (parsed.headers.includes(key)) key += '_';
    const result = buildPanel({headers:[key,...parsed.headers],rows:parsed.rows.map((r,i) => ({...r,[key]:String(i+1)}))},key,null,variables,{kind:mode});
    result.entityColumn = 'Row'; result.entityLabelKey = 'rowNumber';
    return result;
  }
  if (mode === 'panel' || mode === 'cross-section') {
    return buildPanel(parsed, entity, mode === 'cross-section' ? null : time, variables, {timeFormat, kind:mode});
  }
  if (!['series', 'wide'].includes(mode)) throw new Error('Unknown data structure.');
  if (!parsed.headers.includes(time) || !variables.length || variables.includes(time) || variables.some(v => !parsed.headers.includes(v))) throw new Error('Choose a time column and separate numeric columns.');
  if (mode === 'wide' && !measure?.trim()) throw new Error('Name the common measure and its unit.');
  if (mode === 'series' && !entityName?.trim()) throw new Error('Name this time series entity.');
  // Internal keys cannot collide with any user column or variable name.
  let entityKey = '__entity';
  while (parsed.headers.includes(entityKey) || entityKey === measure) entityKey += '_';
  let timeKey = '__time';
  while (parsed.headers.includes(timeKey) || timeKey === measure) timeKey += '_';
  const measures = mode === 'wide' ? [measure.trim()] : variables;
  if (parsed.rows.length * (mode === 'wide' ? variables.length : 1) > MAX_ROWS) throw new Error('Limit: 100,000 records.');
  const rows = parsed.rows.flatMap(row => mode === 'wide'
    ? variables.map(column => ({[entityKey]:column, [timeKey]:row[time], [measures[0]]:row[column]}))
    : [{...row, [entityKey]:entityName.trim(), [timeKey]:row[time]}]);
  const result = buildPanel({headers:[entityKey,timeKey,...measures], rows}, entityKey, timeKey, measures, {timeFormat});
  result.entityColumn = 'Entity';
  result.entityLabelKey = 'entity';
  result.timeColumn = time;
  result.importMode = mode;
  return result;
}

// Append entities, never join observations or resolve collisions implicitly.
export function combinePanels(current, incoming) {
  if (current.kind === 'cross-section' || incoming.kind === 'cross-section') throw new Error('Combining series requires a time axis in both datasets.');
  if (current.timeFormat !== incoming.timeFormat) throw new Error('Use the same time format for both datasets. No automatic resampling.');
  if (current.variables.length !== incoming.variables.length || current.variables.some(v => !incoming.variables.includes(v))) throw new Error('Series must have the same measure names and units.');
  if (incoming.entities.some(entity => current.entities.includes(entity))) throw new Error('An entity with that name already exists. Choose distinct entity names.');
  const entities = [...current.entities, ...incoming.entities];
  const times = [...new Set([...current.times,...incoming.times])].sort((a,b) => a-b);
  const records = new Map([...current.records,...incoming.records]);
  if (records.size > MAX_ROWS || entities.length * times.length * current.variables.length > MAX_CELLS) throw new Error('Combined panel exceeds 100,000 records or 2,000,000 cells.');
  const ranges = Object.fromEntries(current.variables.map(variable => {
    const values = [...records.values()].map(record => record.values[variable]).filter(value => value !== null);
    return [variable,{min:values.length ? Math.min(...values) : 0,max:values.length ? Math.max(...values) : 1}];
  }));
  return {...current, entities, times, records, ranges, timeLabels:new Map([...current.timeLabels,...incoming.timeLabels]),
    rowCount:records.size, missingValues:current.missingValues+incoming.missingValues, absentRecords:entities.length*times.length-records.size};
}
