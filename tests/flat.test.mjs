import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,buildPanel} from '../web/data.mjs';
import {flatRecords,flatColumns,flatValues} from '../web/flat.mjs';

test('flat view preserves observed rows, missing values and zero without filling a balanced panel',()=>{
  const panel=buildPanel(parseCSV('id,year,a,b\n001,2020,0,1\n002,2021,,2\n001,2021,3,4'),'id','year',['a','b']);
  const state={included:[0,1],visibleVariables:[0],aggregation:'mean'};
  const records=flatRecords(panel,state);
  assert.equal(records.length,3);
  assert.deepEqual(flatColumns(panel,state),['id','year','a']);
  assert.deepEqual(records.map(r=>flatValues(panel,state,r)),[['001','2020',0],['002','2021',null],['001','2021',3]]);
  assert.equal(state.aggregation,'mean');
  assert.equal(panel.records.size,3);
});
test('flat entity and variable selections are respected without inventing cross-section time',()=>{
  const panel=buildPanel(parseCSV('id,a,b\nA,2,3\nB,4,5'),'id',null,['a','b'],{kind:'cross-section'});
  const state={included:[1],visibleVariables:[1]};
  assert.deepEqual(flatColumns(panel,state),['id','b']);
  assert.deepEqual(flatRecords(panel,state).map(r=>flatValues(panel,state,r)),[['B',5]]);
});
