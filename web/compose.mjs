import { MAX_ROWS, MAX_BYTES, MAX_CELLS } from './limits.mjs';

// Exact string keys: no case folding, numeric coercion or implicit date conversion.
// Empty/whitespace keys never match, including to another empty key.
const keyFor = (row, columns) => {
  const values = columns.map(column => row[column]);
  return values.some(value => value == null || !String(value).trim()) ? null : JSON.stringify(values);
};
function fail(code) { throw new Error(code); }
function pushRow(rows, row, budget) {
  if ((rows.length + 1) * Object.keys(row).length > MAX_CELLS || rows.length >= MAX_ROWS) fail('composeLimit');
  budget.bytes += new TextEncoder().encode(JSON.stringify(row)).length + (rows.length ? 1 : 0);
  if (budget.bytes > MAX_BYTES) fail('composeLimit');
  rows.push(row);
}
function finish(headers, rows, audit) {
  if (rows.length > MAX_ROWS) fail('composeLimit');
  if (new TextEncoder().encode(JSON.stringify(rows)).length > MAX_BYTES) fail('composeLimit');
  return {table:{headers,rows},audit:{...audit,outputRows:rows.length}};
}
export function composeTables(left, right, {operation='left', keys=[], columns=[], cardinality='many-to-one'} = {}) {
  if (!left?.rows || !right?.rows) fail('composeNeedTables');
  if (left.rows.length > MAX_ROWS || right.rows.length > MAX_ROWS) fail('composeLimit');
  if (!['left','inner','append'].includes(operation)) fail('composeOperation');
  const audit = {operation,leftRows:left.rows.length,rightRows:right.rows.length};
  if (operation === 'append') {
    if (left.headers.length !== right.headers.length || left.headers.some(name => !right.headers.includes(name))) fail('composeSchema');
    if (left.rows.length + right.rows.length > MAX_ROWS || (left.rows.length + right.rows.length) * left.headers.length > MAX_CELLS) fail('composeLimit');
    const rows = [], budget = {bytes:2};
    for (const source of [left,right]) for (const row of source.rows) pushRow(rows,Object.fromEntries(left.headers.map(name=>[name,row[name]])),budget);
    return finish([...left.headers],rows,audit);
  }
  if (!['one-to-one','many-to-one'].includes(cardinality)) fail('composeCardinality');
  if (!keys.length || keys.some(pair=>!left.headers.includes(pair.left)||!right.headers.includes(pair.right))) fail('composeKeys');
  const leftKeys = keys.map(pair=>pair.left), rightKeys = keys.map(pair=>pair.right);
  if (new Set(leftKeys).size !== keys.length || new Set(rightKeys).size !== keys.length) fail('composeKeys');
  if (!columns.length || new Set(columns).size !== columns.length || columns.some(name=>!right.headers.includes(name))) fail('composeColumns');
  if (columns.some(name=>left.headers.includes(name))) fail('composeCollision');
  const index = new Map();
  let missingRight = 0;
  for (const row of right.rows) {
    const key = keyFor(row,rightKeys);
    if (key === null) { missingRight++; continue; }
    if (index.has(key)) fail('composeDuplicateRight');
    index.set(key,row);
  }
  const seen = new Set(), used = new Set(), rows = [], budget = {bytes:2};
  let matched = 0, missingLeft = 0;
  for (const row of left.rows) {
    const key = keyFor(row,leftKeys);
    if (key === null) missingLeft++;
    else {
      if (cardinality === 'one-to-one' && seen.has(key)) fail('composeDuplicateLeft');
      seen.add(key);
    }
    const match = key === null ? undefined : index.get(key);
    if (match) { matched++; used.add(key); }
    if (match || operation === 'left') pushRow(rows,Object.fromEntries([
      ...left.headers.map(name=>[name,row[name]]), ...columns.map(name=>[name,match ? match[name] : ''])
    ]),budget);
  }
  return finish([...left.headers,...columns],rows,{...audit,cardinality,matchedLeft:matched,
    unmatchedLeft:left.rows.length-matched,unmatchedRight:right.rows.length-used.size,missingLeft,missingRight});
}
