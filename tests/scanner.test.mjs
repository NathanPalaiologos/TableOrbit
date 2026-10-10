import test from 'node:test';
import assert from 'node:assert/strict';
import {scanAnalysisSpec} from '../web/scanner.mjs';

const base={id:'source',columns:['event_id'],filters:[{column:'matched',op:'eq',value:'true'}],timeRange:{column:'date',start:'2020-01-01',end:'2020-12-31'}};
const choices={measures:['value'],entity:'company',time:'date',view:'summary',timeOffset:0};

test('record summaries do not audit incidental panel choices',()=>{
  const query=scanAnalysisSpec(base,{...choices,action:'summary'});
  assert.equal(query.entity,null);
  assert.deepEqual(query.filters,base.filters);
  assert.deepEqual(query.timeRange,base.timeRange);
  assert.deepEqual(query.columns,['value']);
  assert.equal(scanAnalysisSpec(base,{...choices,action:'summary',audit:true}).entity,'company');
});

test('panel slices and raw entity figures keep key validation',()=>{
  for(const action of ['axes','panel'])assert.equal(scanAnalysisSpec(base,{...choices,action}).entity,'company');
  assert.equal(scanAnalysisSpec(base,{...choices,action:'figure-data',aggregation:'none',variable:'value'}).entity,'company');
});

test('aggregate figures query their own variable, retaining the source filters',()=>{
  const query=scanAnalysisSpec(base,{...choices,action:'figure-data',variable:'another_measure'});
  assert.deepEqual(query.columns,['another_measure']);
  assert.equal(query.variable,'another_measure');
  assert.equal(query.entity,null);
  assert.deepEqual(query.timeRange,base.timeRange);
  assert.deepEqual(query.filters,base.filters);
});
