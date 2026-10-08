import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, buildPanel } from '../web/data.mjs';
import { summaryTable, viewRows } from '../web/analysis.mjs';
import { moveLayer, coordinateAt, layerValues } from '../web/reader.mjs';
const p = buildPanel(parseCSV('id,t,x,y,z\nA,1,0,9,\nA,2,4,8,\nB,1,2,7,\nB,3,,6,'),'id','t',['x','y','z']);
const s = {turn:0,entity:0,time:0,variable:0,included:[0,1],visibleVariables:[0,2],aggregation:'none'};
test('summary distinguishes N, missing cells and absent keys; type-7 quartiles and n-1 SD', () => {
  const [x,z] = summaryTable(p,s);
  assert.deepEqual(x,{variable:'x',n:3,missing:1,absent:2,mean:2,sd:2,min:0,q25:1,median:2,q75:3,max:4});
  assert.equal(z.n,0); assert.equal(z.missing,4); assert.equal(z.absent,2); assert.equal(z.mean,null); assert.equal(z.sd,null);
  const current = summaryTable(p,s,'current')[0];
  assert.equal(current.n,2); assert.equal(current.mean,1); assert.equal(current.absent,0);
  assert.equal(summaryTable(p,{...s,aggregation:'sum'})[0].mean,2);
  assert.equal(summaryTable(p,{...s,included:[0]},'current')[0].sd,null);
});
test('visible-variable selection preserves original coordinates in both reading faces', () => {
  const state = {...s,turn:1};
  assert.deepEqual(layerValues(p,state),['x','z']);
  moveLayer(p,state,1); assert.equal(state.variable,2);
  moveLayer(p,state,1); assert.equal(state.variable,2);
  assert.deepEqual(coordinateAt(p,{...state,turn:0},1),{time:0,variable:2});
  assert.equal(viewRows(p,s,true)[0].cells.length,2);
  const page = viewRows(p,s,false,{rowStart:1,rowEnd:2,columnStart:1,columnEnd:3});
  assert.equal(page.length,1); assert.equal(page[0].entityIndex,1); assert.equal(page[0].cells.length,2);
});
