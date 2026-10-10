import {variableIndexes} from './reader.mjs';
import {timeLabel} from './time.mjs';

// Flatten only observed records. Missing entity–time combinations are not rows.
export function flatRecords(panel,state) {
  const entities=new Set(state.included.map(index=>panel.entities[index]));
  return [...panel.records.values()].filter(record=>entities.has(record.entity));
}
export function flatColumns(panel,state) {
  return [panel.entityColumn,...(panel.kind==='cross-section'?[]:[panel.timeColumn]),
    ...variableIndexes(panel,state).map(index=>panel.variables[index])];
}
export function flatValues(panel,state,record) {
  return [record.entity,...(panel.kind==='cross-section'?[]:[timeLabel(panel,record.time)]),
    ...variableIndexes(panel,state).map(index=>record.values[panel.variables[index]])];
}
