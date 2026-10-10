// Deliberate, bounded real-data stress run. Not part of the routine unit-test command.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFile, importTable } from '../web/import.mjs';
import { numericColumns } from '../web/data.mjs';
import { summaryTable, viewRows } from '../web/analysis.mjs';
import { PAGE_ROWS, PAGE_COLUMNS } from '../web/limits.mjs';
const reference = JSON.parse(readFileSync(new URL('./fixtures/real-data-reference.json',import.meta.url),'utf8'));
const results = [];
for (const name of ['diamonds','nlswork','co2']) {
  const raw = readFileSync(new URL(`../web/data/${name}.csv`,import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'),reference[name].sha256);
  const start = performance.now();
  const parsed = parseFile(raw,`${name}.csv`);
  const variables = numericColumns(parsed,name === 'nlswork' ? ['idcode','year'] : ['date']);
  const mapping = name === 'diamonds' ? {mode:'cross-section',rowId:true,variables} : name === 'nlswork' ? {entity:'idcode',time:'year',variables} : {mode:'series',entityName:'Mauna Loa',time:'date',timeFormat:'date',variables};
  const panel = importTable(parsed,mapping);
  const imported = performance.now();
  assert.equal(panel.rowCount,reference[name].rows); assert.equal(panel.entities.length,reference[name].entities); assert.equal(panel.times.length,reference[name].times);
  const state = {turn:0,time:0,variable:0,entity:0,aggregation:'none',included:panel.entities.map((_,i) => i),visibleVariables:panel.variables.map((_,i) => i)};
  const summary = summaryTable(panel,state);
  const summarized = performance.now();
  for (const expected of reference[name].stats) {
    const actual = summary.find(row => row.variable === expected.variable);
    for (const [key,value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(actual[key]-value) <= 1e-9*Math.max(1,Math.abs(value)),`${name}.${expected.variable}.${key}: ${actual[key]} vs ${value}`);
      else assert.equal(actual[key],value);
    }
  }
  for (const cross of [true,false]) {
    const page = viewRows(panel,state,cross,{rowStart:0,rowEnd:PAGE_ROWS,columnStart:0,columnEnd:PAGE_COLUMNS});
    assert.ok(page.length <= PAGE_ROWS && page.every(row => row.cells.length <= PAGE_COLUMNS));
    const lastRowStart = Math.floor((state.included.length-1)/PAGE_ROWS)*PAGE_ROWS;
    const last = viewRows(panel,state,cross,{rowStart:lastRowStart,rowEnd:lastRowStart+PAGE_ROWS,columnStart:0,columnEnd:PAGE_COLUMNS});
    assert.equal(last.at(-1).entityIndex,state.included.at(-1));
  }
  // Format parity on actual source rows; no synthetic expansion of the datasets.
  const pilot = {headers:parsed.headers,rows:parsed.rows.slice(0,100)};
  const json = JSON.stringify(pilot.rows);
  const jsonl = pilot.rows.map(row => JSON.stringify(row)).join('\n');
  assert.deepEqual(parseFile(json,'pilot.json'),pilot);
  assert.deepEqual(parseFile(jsonl,'pilot.jsonl'),pilot);
  const repeated = {...parsed,rows:[parsed.rows[0],parsed.rows[0]]};
  if (name === 'diamonds') assert.equal(importTable(repeated,mapping).rowCount,2); // Equal-valued records are not deduplicated.
  else assert.throws(() => importTable(repeated,mapping),/重复面板键/);
  results.push({dataset:name,records:panel.rowCount,entities:panel.entities.length,periods:panel.times.length,variables:panel.variables.length,missingCells:panel.missingValues,absentRecords:panel.absentRecords,
    importMs:Math.round(imported-start),summaryMs:Math.round(summarized-imported),heapMB:Math.round(process.memoryUsage().heapUsed/1024/1024)});
}
mkdirSync(new URL('./output/',import.meta.url),{recursive:true});
writeFileSync(new URL('./output/stress-results.json',import.meta.url),JSON.stringify({runtime:process.version,results},null,2)+'\n');
console.table(results);
