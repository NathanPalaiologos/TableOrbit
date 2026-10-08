// A selection is a stable coordinate in the original panel, independent of view.
export function faceIndex(turn) { return ((turn % 4) + 4) % 4; }
export function isCrossSection(state) { return faceIndex(state.turn) % 2 === 0; }
export const variableIndexes = (panel, state) => state.visibleVariables ?? panel.variables.map((_,i) => i);
export function layerValues(panel, state) {
  return isCrossSection(state) ? panel.times : variableIndexes(panel,state).map(i => panel.variables[i]);
}
export function moveLayer(panel, state, step) {
  const key = isCrossSection(state) ? 'time' : 'variable';
  const values = layerValues(panel, state);
  const indexes = variableIndexes(panel,state);
  const position = key === 'time' ? state.time : indexes.indexOf(state.variable);
  const next = Math.max(0, Math.min(values.length - 1, position + step));
  state[key] = key === 'time' ? next : indexes[next];
}
export function coordinateAt(panel, state, column, cross = isCrossSection(state)) {
  return { time: cross ? state.time : column, variable: cross ? variableIndexes(panel,state)[column] : state.variable };
}
