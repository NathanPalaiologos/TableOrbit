import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV, buildPanel} from '../web/data.mjs';
import {summarize, viewRows, chartData} from '../web/analysis.mjs';
const panel = buildPanel(parseCSV('id,t,x,y\nA,1,0,10\nA,4,4,\nB,1,2,20\nB,4,,40\nC,1,10,30'), 'id','t',['x','y']);
const state = {turn:0,entity:0,time:0,variable:0,included:[0,1,2],aggregation:'mean'};

test('aggregation statistics, denominators and all-missing groups', () => {
  const values = [0,2,null,10];
  const expected = {mean:4,median:2,sum:12,min:0,max:10,count:3,sd:Math.sqrt(28)};
  for (const [method,value] of Object.entries(expected)) {
    assert.deepEqual(summarize(values,method), {value,n:3});
  }
  assert.deepEqual(summarize([null,null],'mean'), {value:null,n:0});
  assert.deepEqual(summarize([null,null],'sum'), {value:null,n:0});
  assert.deepEqual(summarize([null,null],'count'), {value:0,n:0});
  assert.deepEqual(summarize([4],'sd'), {value:null,n:1});
  assert.equal(summarize([1,5,2,10],'median').value, 3.5);
  assert.throws(() => summarize([1e308,1e308],'sum'), /overflow/);
});
test('aggregation respects included entities in both reading faces', () => {
  const subset = {...state,included:[0,1]};
  assert.deepEqual(viewRows(panel,subset,true)[0].cells, [{value:1,n:2},{value:15,n:2}]);
  assert.deepEqual(viewRows(panel,subset,false)[0].cells, [{value:1,n:2},{value:4,n:1}]);
  assert.equal(panel.records.size,5);
});
test('raw view restores original identities and missing/absent states', () => {
  const rows = viewRows(panel,{...state,aggregation:'none',time:1},true);
  assert.equal(rows[0].entityIndex,0);
  assert.deepEqual(rows[1].cells[0],{value:null,absent:false,n:0});
  assert.deepEqual(rows[2].cells[0],{value:null,absent:true,n:0});
});
test('line chart shares aggregate calculations and preserves real time spacing', () => {
  const data = chartData(panel,state,{type:'line',scope:'selected'});
  assert.deepEqual(data.series[0].points,[{time:1,x:1,y:4,n:3},{time:4,x:4,y:4,n:1}]);
  assert.deepEqual(data.metadata.entities,['A','B','C']);
});
test('scatter uses complete pairs in the current period, never invented zeros', () => {
  const data = chartData(panel,{...state,aggregation:'none'},{type:'scatter',scope:'included',xVariable:'y'});
  assert.equal(data.metadata.plottedCount,3);
  assert.deepEqual(data.series[0].points[0],{time:1,x:10,y:0,n:1});
  assert.throws(() => chartData(panel,{...state,time:1,aggregation:'none'},{type:'scatter',scope:'included',xVariable:'y'}), /No observed/);
});
test('histogram scope and missing line values are explicit', () => {
  const s = {...state,entity:1,aggregation:'none'};
  const histogram = chartData(panel,s,{type:'histogram',scope:'included'});
  assert.equal(histogram.metadata.inputCount,6);
  assert.equal(histogram.metadata.plottedCount,4);
  const line = chartData(panel,s,{type:'line',scope:'selected'});
  assert.equal(line.series[0].points[1].y,null);
  assert.throws(() => chartData(panel,state,{type:'scatter',scope:'included',xVariable:'y'}), /raw/);
});
