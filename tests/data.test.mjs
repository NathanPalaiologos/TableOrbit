import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, buildPanel, cell, seriesFor } from '../web/data.mjs';
const text = readFileSync(new URL('../web/data/grunfeld.csv', import.meta.url), 'utf8');
const panel = buildPanel(parseCSV(text), 'firm', 'year', ['invest', 'value', 'capital']);
test('Grunfeld: keys, coverage, and actual observations', () => {
  assert.equal(panel.rowCount, 220); assert.equal(panel.entities.length, 11); assert.equal(panel.times.length, 20);
  assert.equal(panel.absentRecords, 0); assert.equal(panel.missingValues, 0);
  assert.equal(cell(panel, 'General Motors', 1935, 'invest').value, 317.6);
  assert.equal(cell(panel, 'US Steel', 1937, 'invest').value, 469.9);
});
test('selection, time filtering and explicit aggregation use original rows', () => {
  const total = seriesFor(panel, 'invest', panel.entities, 1935, 1937, 'sum')[0];
  [730.398, 1021.713, 1235.043].forEach((expected, i) => assert.ok(Math.abs(total.points[i].value - expected) < 1e-8));
  const selected = seriesFor(panel, 'invest', ['General Motors', 'US Steel'], 1935, 1935, 'mean')[0];
  assert.equal(selected.points[0].value, 263.75); assert.equal(selected.points[0].n, 2);
  assert.deepEqual(seriesFor(panel, 'invest', [], 1935, 1954, 'sum'), []);
});
test('missing cells, absent rows and actual zero remain distinct', () => {
  const p = buildPanel(parseCSV('id,t,x\nA,1,0\nA,2,NA\nB,1,4\nB,3,8'), 'id', 't', ['x']);
  assert.deepEqual(cell(p, 'A', 1, 'x'), { value: 0, absent: false });
  assert.deepEqual(cell(p, 'A', 2, 'x'), { value: null, absent: false });
  assert.deepEqual(cell(p, 'B', 2, 'x'), { value: null, absent: true });
  assert.equal(seriesFor(p, 'x', ['A','B'], 1, 3, 'mean')[0].points[0].value, 2);
  assert.equal(seriesFor(p, 'x', ['A','B'], 1, 3, 'sum')[0].points[1].value, null);
});
test('reject duplicate keys, invalid values and ambiguous time', () => {
  assert.throws(() => buildPanel(parseCSV('id,t,x\nA,1,1\nA,1.0,2'), 'id','t',['x']), /重复面板键/);
  assert.throws(() => buildPanel(parseCSV('id,t,x\nA,1,hello'), 'id','t',['x']), /非数值/);
  assert.throws(() => buildPanel(parseCSV('id,t,x\nA,2024-01-01,1'), 'id','t',['x']), /Invalid number time/);
});
test('CSV handles BOM, CRLF, escaped quotes, embedded commas and rejects malformed rows', () => {
  const p = parseCSV('\uFEFFid,t,x\r\n"A, ""B""",1,2\r\n');
  assert.equal(p.rows[0].id, 'A, "B"');
  assert.throws(() => parseCSV('a,b\n"unfinished,2'), /未闭合/);
  assert.throws(() => parseCSV('a,b\n1,2,3'), /列数/);
  assert.throws(() => parseCSV('a,a\n1,2'), /列名/);
});
test('numeric variables with Object prototype names retain their values', () => {
  const p=buildPanel(parseCSV('id,t,__proto__,constructor\nA,1,5,7'),'id','t',['__proto__','constructor']);
  assert.equal(cell(p,'A',1,'__proto__').value,5);
  assert.equal(cell(p,'A',1,'constructor').value,7);
});
