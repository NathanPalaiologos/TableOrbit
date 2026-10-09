import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFile,importTable} from '../web/import.mjs';
import {composeTables} from '../web/compose.mjs';
const csv = text=>parseFile(text,'sample.csv');
const left=csv('id,year,x\n001,2020,0\n001,2021,2\n002,2020,3');
const right=csv('code,z\n001,10\n003,20');
const options={keys:[{left:'id',right:'code'}],columns:['z']};

test('left join retains observations, zeros, missing matches and source immutability',()=>{
  const before=JSON.stringify([left,right]); const {table,audit}=composeTables(left,right,options);
  assert.equal(table.rows.length,3); assert.equal(table.rows[0].x,'0'); assert.equal(table.rows[2].z,'');
  assert.deepEqual([audit.matchedLeft,audit.unmatchedLeft,audit.unmatchedRight],[2,1,1]);
  assert.equal(JSON.stringify([left,right]),before);
});
test('inner join exposes sample loss and one-to-one enforces both sides',()=>{
  const {table,audit}=composeTables(left,right,{...options,operation:'inner'});
  assert.equal(table.rows.length,2); assert.equal(audit.unmatchedLeft,1);
  assert.throws(()=>composeTables(left,right,{...options,cardinality:'one-to-one'}),/composeDuplicateLeft/);
  assert.throws(()=>composeTables(left,csv('code,z\n001,1\n001,2'),options),/composeDuplicateRight/);
});
test('keys are exact strings and missing keys never match each other',()=>{
  const a=csv('id,x\n001,1\n,2\nNA,3\nA|B,4'); const b=csv('code,z\n1,9\n,8\nNA,7\nA|B,6');
  const {table,audit}=composeTables(a,b,options);
  assert.deepEqual(table.rows.map(row=>row.z),['','','7','6']);
  assert.deepEqual([audit.missingLeft,audit.missingRight],[1,1]);
});
test('composite keys prevent joining the wrong year and cannot repeat a column',()=>{
  const b=csv('id,year,z\n001,2020,4\n001,2021,5');
  const plan={keys:[{left:'id',right:'id'},{left:'year',right:'year'}],columns:['z']};
  assert.deepEqual(composeTables(left,b,plan).table.rows.map(r=>r.z),['4','5','']);
  assert.throws(()=>composeTables(left,b,{...plan,keys:[plan.keys[0],plan.keys[0]]}),/composeKeys/);
  assert.throws(()=>composeTables(left,b,{...plan,columns:['year']}),/composeCollision/);
});
test('append uses matching schemas without dropping duplicate observations',()=>{
  const next=csv('x,year,id\n8,2022,001');
  const {table}=composeTables(left,next,{operation:'append'});
  assert.equal(table.rows.length,4); assert.equal(importTable(table,{entity:'id',time:'year',variables:['x']}).rowCount,4);
  const duplicate=composeTables(left,left,{operation:'append'}).table;
  assert.throws(()=>importTable(duplicate,{entity:'id',time:'year',variables:['x']}),/重复/);
  assert.throws(()=>composeTables(left,right,{operation:'append'}),/composeSchema/);
});
test('real Grunfeld split and rejoin reconstructs all 220 observations and values',()=>{
  const original=parseFile(readFileSync(new URL('../web/data/grunfeld.csv',import.meta.url),'utf8'),'grunfeld.csv');
  const project=headers=>({headers,rows:original.rows.map(row=>Object.fromEntries(headers.map(name=>[name,row[name]])))});
  const {table,audit}=composeTables(project(['firm','year','invest']),project(['firm','year','value','capital']),{
    keys:[{left:'firm',right:'firm'},{left:'year',right:'year'}],columns:['value','capital'],cardinality:'one-to-one'});
  assert.equal(audit.matchedLeft,220); assert.equal(audit.unmatchedLeft,0);
  for (let i=0;i<220;i++) for (const name of original.headers) assert.equal(table.rows[i][name],original.rows[i][name]);
});
