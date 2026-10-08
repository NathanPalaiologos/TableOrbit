import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, buildPanel, cell } from '../web/data.mjs';
import { faceIndex, isCrossSection, moveLayer, coordinateAt } from '../web/reader.mjs';

const panel = buildPanel(parseCSV('subject,period,a,b\nP,2,0,7\nP,5,,8\nQ,2,9,10'), 'subject', 'period', ['a','b']);

test('up/down change only the depth dimension and stop at boundaries', () => {
  const state = {turn:0, entity:1, time:0, variable:1};
  moveLayer(panel, state, 1);
  assert.deepEqual(state, {turn:0, entity:1, time:1, variable:1});
  moveLayer(panel, state, 1);
  assert.equal(state.time, 1);
  state.turn = 1;
  moveLayer(panel, state, -1);
  assert.deepEqual(state, {turn:1, entity:1, time:1, variable:0});
  moveLayer(panel, state, -1);
  assert.equal(state.variable, 0);
});

test('rotation retains a coordinate and reads the same value in either face', () => {
  const state = {turn:0, entity:0, time:1, variable:1};
  for (const turn of [0,1,2,3,4,-1,-2,-3,-4]) {
    state.turn = turn;
    const column = isCrossSection(state) ? state.variable : state.time;
    const c = coordinateAt(panel, state, column);
    assert.deepEqual(c, {time:1, variable:1});
    assert.equal(cell(panel, panel.entities[state.entity], panel.times[c.time], panel.variables[c.variable]).value, 8);
    assert.ok(faceIndex(turn) >= 0 && faceIndex(turn) < 4);
  }
});

test('both faces retain missing values, zero, and absent observations', () => {
  for (const cross of [true,false]) {
    for (const [entity,time,variable,expected] of [[0,0,0,{value:0,absent:false}],[0,1,0,{value:null,absent:false}],[1,1,1,{value:null,absent:true}]]) {
      const c = coordinateAt(panel, {time, variable}, cross ? variable : time, cross);
      assert.deepEqual(cell(panel, panel.entities[entity], panel.times[c.time], panel.variables[c.variable]), expected);
    }
  }
});
