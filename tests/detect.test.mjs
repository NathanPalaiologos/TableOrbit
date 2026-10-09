import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile, importTable } from '../web/import.mjs';
import { suggestMapping, detectTimeFormats } from '../web/detect.mjs';
import { cell, columnTypes } from '../web/data.mjs';
import { parseTime } from '../web/time.mjs';

const csv = text => parseFile(text,'sample.csv');

test('named axes are chosen regardless of column order and preserve identifier strings', () => {
  const data = csv('value,Firm ID,year\n4,001,2020\n5,001,2022\n6,002,2020');
  const before = JSON.stringify(data);
  const {mapping} = suggestMapping(data);
  assert.equal(mapping.entity,'Firm ID'); assert.equal(mapping.time,'year');
  const panel = importTable(data,{...mapping,variables:['value']});
  assert.equal(cell(panel,'001',2022,'value').value,5);
  assert.equal(panel.absentRecords,1);
  assert.equal(JSON.stringify(data),before);
});

test('common research identifiers and Chinese headers work without dataset-specific defaults', () => {
  for (const [entity,time] of [['gvkey','fyear'],['permno','date'],['idcode','year'],['公司代码','年份'],['patient_id','wave']]) {
    const result = suggestMapping(csv(`${entity},${time},x\nA,68,1\nA,70,2\nB,68,3`));
    assert.equal(result.mapping.entity,entity); assert.equal(result.mapping.time,time);
    assert.equal(result.mapping.timeFormat,'number');
  }
});

test('calendar and timezone formats validate every value, not just the first row', () => {
  for (const [values,format] of [
    [['2024-01-01','2024-03-01'],'date'],[['2024-01','2024-03'],'month'],
    [['2024-Q1','2024-Q3'],'quarter'],[['2024-01-01T00:00:00Z','2024-01-02T08:00:00+08:00'],'timestamp'],
    [['13/01/2024','02/03/2024'],'dmy'],[['01/13/2024','03/02/2024'],'mdy']]) {
    const result = suggestMapping(csv(`id,date,x\nA,${values[0]},1\nA,${values[1]},2\nB,${values[0]},3`));
    assert.equal(result.mapping.timeFormat,format);
  }
  assert.deepEqual(detectTimeFormats(csv('date,x\n2024-01-01,1\n2024-02-30,2'),'date'),[]);
});

test('ambiguous dates, mixed dates, missing time and numeric encodings require explicit choice', () => {
  for (const values of [['03/04/2024','04/05/2024'],['2024-01-01','02/03/2024'],['2024-01-01',''],['20240101','20240102'],['45000','45001'],['1700000000','1700000060']]) {
    assert.equal(suggestMapping(csv(`id,date,x\nA,${values[0]},1\nA,${values[1]},2`)).mapping,null);
  }
});

test('duplicate pairs, composite entity keys and timezone-normalized duplicates are not silently resolved', () => {
  const examples = [
    'id,year,x\nA,2020,1\nA,2020,2\nA,2021,3',
    'country,industry,year,x\nA,X,2020,1\nA,Y,2020,2\nA,X,2021,3',
    'id,date,x\nA,2024-01-01T00:00:00Z,1\nA,2024-01-01T08:00:00+08:00,2'
  ];
  for (const text of examples) {
    const result = suggestMapping(csv(text));
    assert.equal(result.mapping,null); assert.equal(result.reason,'detectDuplicate');
  }
});

test('competing valid identifiers and time axes remain choices', () => {
  const entities = suggestMapping(csv('firm_id,gvkey,year,x\nA,001,2020,1\nA,001,2021,2\nB,002,2020,3'));
  assert.equal(entities.mapping,null); assert.equal(entities.candidates.length,2);
  const times = suggestMapping(csv('id,year,wave,x\nA,2020,1,1\nA,2021,2,2\nB,2020,1,3'));
  assert.equal(times.mapping,null); assert.equal(times.candidates.length,2);
  const splitDate = suggestMapping(csv('id,year,month,x\nA,2020,1,1\nA,2020,2,2\nA,2021,3,3'));
  assert.equal(splitDate.mapping,null); assert.equal(splitDate.reason,'detectMultiple');
});

test('ordinary row IDs, numeric outcomes and wide layouts do not masquerade as panel keys', () => {
  for (const text of [
    'id,year,x\n1,2020,1\n2,2021,2\n3,2022,3',
    'country,income,x\nA,2020,1\nA,2021,2\nB,2020,3',
    'country,2020,2021\nA,1,2\nB,3,4',
    'year,Canada,China\n2020,1,2\n2021,3,4',
    'valid,year,x\n1,2020,1\n1,2021,2\n2,2020,3'
  ]) assert.equal(suggestMapping(csv(text)).mapping,null);
});

test('cross-sections and simple time series are suggested, while single-period panels keep their time', () => {
  assert.equal(suggestMapping(csv('country,x\nA,1\nB,2')).mapping.mode,'cross-section');
  assert.equal(suggestMapping(csv('date,x\n2024-01-01,1\n2024-01-02,2')).mapping.mode,'series');
  assert.equal(suggestMapping(csv('country,year,x\nA,2020,1\nB,2020,2')).mapping.mode,'panel');
  assert.equal(suggestMapping(csv('id,year,x\n,2020,1\nA,2021,2')).reason,'detectMissing');
});

test('bundled research files use the same inference, checked over all their records', () => {
  for (const [file,entity,time,mode] of [
    ['grunfeld.csv','firm','year','panel'],['gapminder.tsv','country','year','panel'],
    ['nlswork.csv','idcode','year','panel'],['co2.csv',undefined,'date','series'],
    ['gapminder-2007.json','country',undefined,'cross-section']]) {
    const parsed = parseFile(readFileSync(new URL('../web/data/'+file,import.meta.url),'utf8'),file);
    const {mapping} = suggestMapping(parsed);
    assert.equal(mapping?.entity,entity,file); assert.equal(mapping?.time,time,file); assert.equal(mapping?.mode,mode,file);
  }
});

test('financial, geographic, UUID and text-composite IDs stay exact', () => {
  for (const [name,a,b] of [
    ['cusip','001234567','009876543'],['geoid','00123','00124'],['cik','0000320193','0000789019'],
    ['uuid','550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440001'],
    ['entity_id','US|Retail','US|Manufacturing'],['stkcd','000001','600000'],
    ['id','9007199254740992','9007199254740993']]) {
    const parsed = csv(`${name},year,x\n${a},2020,1\n${a},2021,2\n${b},2020,3`);
    const panel = importTable(parsed,{...suggestMapping(parsed).mapping,variables:['x']});
    assert.deepEqual(panel.entities,[a,b]); assert.equal(cell(panel,b,2020,'x').value,3);
  }
  for (const id of ['1.5','1e3','0x10']) assert.equal(suggestMapping(csv(`id,year,x\n${id},2020,1\n${id},2021,2`)).mapping,null);
});

test('numeric representations are reported without converting codes, units or missing sentinels', () => {
  const profiles = columnTypes(csv('count,amount,sci,flag,code,big,percent,money,mixed,empty,sentinel\n2,-1.25,1e-3,0,001,9007199254740993,12%,$10,3,NA,-999\n3,2.50,2e2,1,002,9007199254740994,15%,$12,x,,1'));
  assert.deepEqual(profiles.map(p=>p.type),['typeInteger','typeDecimal','typeScientific','typeBinary','typeZeroCode','typeLargeInteger','typePercent','typeFormatted','typeMixed','typeEmpty','typeInteger']);
  assert.equal(profiles.at(-2).missing,2); assert.equal(profiles.at(-1).missing,0);
  const p = importTable(csv('id,year,count,amount,sci,flag\nA,2020,2,-1.25,1e-3,0'),{entity:'id',time:'year',variables:['count','amount','sci','flag']});
  assert.equal(cell(p,'A',2020,'sci').value,.001); assert.equal(cell(p,'A',2020,'flag').value,0);
});

test('JSON/JSONL large IDs retain distinct source tokens, unsafe arithmetic is rejected', () => {
  const records = ['{"id":9007199254740992,"year":2020,"x":1}','{"id":9007199254740992,"year":2021,"x":2}','{"id":9007199254740993,"year":2020,"x":3}'];
  for (const [file,text] of [['x.json','['+records.join(',')+']'],['x.jsonl',records.join('\n')]]) {
    const parsed = parseFile(text,file);
    const p = importTable(parsed,{...suggestMapping(parsed).mapping,variables:['x']});
    assert.deepEqual(p.entities,['9007199254740992','9007199254740993']);
  }
  assert.throws(()=>importTable(csv('id,year,x\nA,2020,9007199254740993'),{entity:'id',time:'year',variables:['x']}),/Unsafe integer/);
  assert.throws(()=>parseTime('9007199254740993','number'),/Invalid/);
  assert.throws(()=>parseFile('[{"x":1e999}]','x.json'),/Nonfinite/);
});
