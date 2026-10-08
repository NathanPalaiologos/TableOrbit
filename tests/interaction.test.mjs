import test from 'node:test';
import assert from 'node:assert/strict';
import {readerCommand,moveCell,acceptsRepeat} from '../web/interaction.mjs';
import {parseCSV,buildPanel} from '../web/data.mjs';
import {chartData} from '../web/analysis.mjs';

test('one context consumes a key: controls, dialogs, IME and browser modifiers win', () => {
  const event = {key:'ArrowRight'};
  assert.equal(readerCommand(event),'rotate');
  assert.equal(readerCommand({...event,key:'ArrowDown'}),'layer');
  assert.equal(readerCommand({...event,shiftKey:true}),'cell');
  for (const flag of ['defaultPrevented','isComposing','altKey','ctrlKey','metaKey']) assert.equal(readerCommand({...event,[flag]:true}),null);
  for (const context of [{nativeControl:true},{modal:true},{summary:true},{crossOnly:true}]) assert.equal(readerCommand(event,context),null);
  assert.equal(readerCommand({key:'ArrowDown'},{summary:true,currentPeriod:true}),'layer');
  assert.equal(readerCommand({key:'ArrowDown',shiftKey:true},{summary:true,currentPeriod:true}),null);
  assert.equal(readerCommand({...event,shiftKey:true},{crossOnly:true}),'cell');
  assert.equal(readerCommand({key:'ArrowDown',keyCode:229}),null);
});
test('held rotation is consumed once; repeat movement is rate limited without dropping distinct taps', () => {
  assert.equal(acceptsRepeat('rotate',{repeat:true},1000),false);
  assert.equal(acceptsRepeat('layer',{repeat:true},30),false);
  assert.equal(acceptsRepeat('cell',{repeat:true},85),true);
  assert.equal(acceptsRepeat('rotate',{repeat:false},0),true);
});
const panel = buildPanel(parseCSV('id,t,x,y,z\nA,1,1,10,100\nB,1,2,20,200\nC,4,3,30,300'),'id','t',['x','y','z']);
test('cell movement follows visible rows/columns, clamps, preserves depth and skips excluded variables', () => {
  const s = {turn:0,entity:0,time:0,variable:0,aggregation:'none',included:[0,2],visibleVariables:[0,2]};
  moveCell(panel,s,'ArrowDown'); assert.equal(s.entity,2);
  assert.equal(moveCell(panel,s,'ArrowDown'),false);
  moveCell(panel,s,'ArrowRight'); assert.equal(s.variable,2); assert.equal(s.time,0); assert.equal(s.turn,0);
  s.turn=1; moveCell(panel,s,'ArrowRight'); assert.equal(s.time,1); assert.equal(s.variable,2);
  s.aggregation='mean'; assert.equal(moveCell(panel,s,'ArrowUp'),false);
});
test('plot Y and entity/time choices are independent of reader selection; scatter swaps use original pairs', () => {
  const s = {turn:0,entity:0,time:0,variable:0,aggregation:'none',included:[0,1],visibleVariables:[0]};
  const before = JSON.stringify(s);
  const data = chartData(panel,s,{type:'scatter',scope:'included',xVariable:'x',yVariable:'y'});
  assert.equal(data.series[0].points[0].y,10);
  assert.equal(data.metadata.variable,'y');
  const swapped = chartData(panel,s,{type:'scatter',scope:'included',xVariable:'y',yVariable:'x'});
  assert.equal(swapped.series[0].points[0].x,10); assert.equal(swapped.series[0].points[0].y,1);
  assert.equal(JSON.stringify(s),before);
  assert.throws(() => chartData(panel,s,{type:'line',scope:'selected',yVariable:'unknown'}),/Y variable/);
});
