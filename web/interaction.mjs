import { isCrossSection, variableIndexes } from './reader.mjs';

// One routing point: native controls and IME keep their keys before reader actions.
export function readerCommand(event, {nativeControl=false, modal=false, summary=false, currentPeriod=false, crossOnly=false} = {}) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || nativeControl || modal || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return null;
  if (summary) return !crossOnly && currentPeriod && !event.shiftKey && ['ArrowUp','ArrowDown'].includes(event.key) ? 'layer' : null;
  if (event.shiftKey) return 'cell';
  if (crossOnly) return null;
  return ['ArrowLeft','ArrowRight'].includes(event.key) ? 'rotate' : 'layer';
}

export function acceptsRepeat(command, event, elapsedMs) {
  return !event.repeat || (command !== 'rotate' && elapsedMs >= 85);
}

export function moveCell(panel, state, key) {
  const before = `${state.entity}/${state.time}/${state.variable}`;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (state.aggregation === 'none') {
      const index = state.included.indexOf(state.entity);
      const step = key === 'ArrowUp' ? -1 : 1;
      state.entity = state.included[Math.max(0,Math.min(state.included.length-1,index+step))];
    }
  } else {
    const step = key === 'ArrowLeft' ? -1 : 1;
    if (isCrossSection(state)) {
      const variables = variableIndexes(panel,state);
      const index = variables.indexOf(state.variable);
      state.variable = variables[Math.max(0,Math.min(variables.length-1,index+step))];
    } else state.time = Math.max(0,Math.min(panel.times.length-1,state.time+step));
  }
  return before !== `${state.entity}/${state.time}/${state.variable}`;
}
