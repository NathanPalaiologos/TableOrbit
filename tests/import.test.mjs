import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile, importTable, combinePanels } from '../web/import.mjs';
import { parseTime, timeLabel } from '../web/time.mjs';
import { cell } from '../web/data.mjs';
import { chartData } from '../web/analysis.mjs';
const example = name => parseFile(readFileSync(new URL('../web/data/' + name, import.meta.url), 'utf8'), name);

test('CSV, TSV, JSON and JSONL produce the same records, including zero and missing', () => {
  const files = [['csv','id,time,x\nA,2024,0\nB,2024,'], ['tsv','id\ttime\tx\nA\t2024\t0\nB\t2024\t'], ['json','[{"id":"A","time":2024,"x":0},{"id":"B","time":2024,"x":null}]'], ['jsonl','{"id":"A","time":2024,"x":0}\n{"id":"B","time":2024}']];
  for (const [ext,text] of files) {
    const p = importTable(parseFile(text,'input.'+ext), {entity:'id',time:'time',variables:['x']});
    assert.equal(cell(p,'A',2024,'x').value,0);
    assert.deepEqual(cell(p,'B',2024,'x'),{value:null,absent:false});
    assert.deepEqual(cell(p,'C',2024,'x'),{value:null,absent:true});
  }
  assert.equal(parseFile('id\tx\n"A\tB"\t2','x.tsv').rows[0].id,'A\tB');
  assert.equal(parseFile('[{"id":1,"x":{"nested":2}}]','x.json').rows[0].x,'{"nested":2}');
  assert.throws(() => parseFile('a,b\n1,2','x.xlsx'),/Supported/);
  assert.equal(parseFile('[{"id":"A","constructor":3},{"id":"B"}]','x.json').rows[1].constructor,'');
});

test('calendar formats are strict and explicit, timestamps normalize to UTC', () => {
  assert.equal(parseTime('2024-02-29','date').label,'2024-02-29');
  assert.equal(parseTime('29/02/2024','dmy').label,'2024-02-29');
  assert.equal(parseTime('03/04/2024','dmy').label,'2024-04-03');
  assert.equal(parseTime('03/04/2024','mdy').label,'2024-03-04');
  assert.equal(parseTime('2024-02','month').label,'2024-02');
  assert.equal(parseTime('2024-Q3','quarter').label,'2024-Q3');
  assert.equal(parseTime('2024-02-01T08:00:00+08:00','timestamp').key,parseTime('2024-02-01T00:00:00Z','timestamp').key);
  for (const [value,format] of [['2023-02-29','date'],['2024-13','month'],['2024-Q5','quarter'],['03/04/2024','date'],['2024-01-01T00:00:00','timestamp'],['2024-01-01T24:00:00Z','timestamp'],['2024-01-01T00:00:00-00:00','timestamp']]) assert.throws(() => parseTime(value,format));
});

test('Gapminder panel: 142 countries, 12 observed years, no duplicate or absent keys', () => {
  const p = importTable(example('gapminder.tsv'), {entity:'country',time:'year',variables:['lifeExp','pop','gdpPercap']});
  assert.equal(p.rowCount,1704); assert.equal(p.entities.length,142); assert.equal(p.times.length,12);
  assert.equal(p.absentRecords,0); assert.equal(p.missingValues,0);
  assert.equal(cell(p,'Canada',2007,'lifeExp').value,80.653);
});

test('cross-section has unique entity keys, no public time axis and no line plot', () => {
  const p = importTable(example('gapminder-2007.json'), {mode:'cross-section',entity:'country',variables:['lifeExp','pop']});
  assert.equal(p.rowCount,142); assert.equal(p.timeColumn,null); assert.equal(timeLabel(p,0),'');
  const s = {entity:0,time:0,variable:0,aggregation:'none',included:[0,1]};
  assert.throws(() => chartData(p,s,{type:'line',scope:'included'}),/no time axis/);
  const data = chartData(p,s,{type:'histogram',scope:'included'});
  assert.deepEqual(data.metadata.times,[]); assert.equal(data.series[0].points[0].time,null);
  assert.throws(() => importTable(parseFile('id,x\nA,1\nA,2','x.csv'), {mode:'cross-section',entity:'id',variables:['x']}),/重复/);
});

test('wide series reshape preserves values, measure and original years', () => {
  const p = importTable(example('gapminder-life-expectancy.csv'), {mode:'wide',time:'year',variables:['Canada','China','United States'],measure:'Life expectancy (years)'});
  assert.equal(p.rowCount,36); assert.deepEqual(p.entities,['Canada','China','United States']);
  assert.equal(p.times[0],1952); assert.equal(p.times.at(-1),2007);
  assert.equal(cell(p,'Canada',2007,'Life expectancy (years)').value,80.653);
});

test('irregular dates sort chronologically, remain spaced and preserve missingness', () => {
  const p = importTable(parseFile('date,A,B\n2024-03-01,3,\n2024-01-01,0,1','x.csv'), {mode:'wide',time:'date',variables:['A','B'],measure:'x',timeFormat:'date'});
  assert.deepEqual(p.times.map(t => timeLabel(p,t)),['2024-01-01','2024-03-01']);
  assert.equal(p.times[1]-p.times[0],60*86400000);
  assert.equal(cell(p,'B',p.times[1],'x').value,null);
  const data = chartData(p,{entity:0,time:0,variable:0,aggregation:'none',included:[0,1]},{type:'line',scope:'included'});
  assert.equal(data.series[0].points[0].x,p.times[0]); assert.equal(data.timeFormat,'date');
  const single = importTable(parseFile('month,x\n2024-02,2\n2024-01,1','x.csv'),{mode:'series',time:'month',variables:['x'],entityName:'Sensor A',timeFormat:'month'});
  assert.deepEqual(single.entities,['Sensor A']); assert.equal(single.rowCount,2);
});

test('duplicates after normalization and mixed time frequencies are rejected', () => {
  const opts = {mode:'series',time:'date',variables:['x'],entityName:'A',timeFormat:'timestamp'};
  assert.throws(() => importTable(parseFile('date,x\n2024-01-01T00:00:00Z,1\n2024-01-01T08:00:00+08:00,2','x.csv'),opts),/重复/);
  assert.throws(() => importTable(parseFile('date,x\n2024-01,1\n2024-01-02,2','x.csv'),{...opts,timeFormat:'month'}),/Invalid/);
});

test('separate series align on union of dates without filling, collisions or source mutation', () => {
  const make = (text,entityName,timeFormat = 'date') => importTable(parseFile(text,'series.csv'),{mode:'series',entityName,time:'date',variables:['x'],timeFormat});
  const a = make('date,x\n2024-01-01,0\n2024-03-01,3','A');
  const b = make('date,x\n2024-02-01,2\n2024-03-01,','B');
  const p = combinePanels(a,b);
  assert.equal(p.rowCount,4); assert.equal(p.absentRecords,2); assert.equal(p.missingValues,1);
  assert.equal(p.times.length,3); assert.equal(a.entities.length,1); assert.equal(a.times.length,2);
  assert.deepEqual(cell(p,'B',p.times[0],'x'),{value:null,absent:true});
  assert.deepEqual(cell(p,'B',p.times[2],'x'),{value:null,absent:false});
  assert.throws(() => combinePanels(a,a),/already exists/);
  assert.throws(() => combinePanels(a,make('date,x\n2024-01,1','C','month')),/same time format/);
  assert.throws(() => combinePanels(a,{...b,variables:['other']}),/same measure/);
});
