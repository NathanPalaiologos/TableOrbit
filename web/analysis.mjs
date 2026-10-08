import { cell } from './data.mjs';
import { coordinateAt, variableIndexes } from './reader.mjs';
import { timeLabel } from './time.mjs';

export const METHODS = ['none', 'mean', 'median', 'sum', 'min', 'max', 'sd', 'count'];

export function summarize(values, method) {
  if (!METHODS.includes(method) || method === 'none') throw new Error('Unknown aggregation');
  const observed = values.filter(value => value !== null);
  const n = observed.length;
  if (method === 'count') return {value:n, n};
  if (!n || (method === 'sd' && n < 2)) return {value:null, n};
  const mean = observed.reduce((sum, value) => sum + value / n, 0);
  let value;
  if (method === 'mean') value = mean;
  if (method === 'sum') value = observed.reduce((sum, value) => sum + value, 0);
  if (method === 'min') value = Math.min(...observed);
  if (method === 'max') value = Math.max(...observed);
  if (method === 'median') {
    const sorted = [...observed].sort((a,b) => a-b);
    const middle = Math.floor(n/2);
    value = n % 2 ? sorted[middle] : sorted[middle-1]/2 + sorted[middle]/2;
  }
  if (method === 'sd') value = Math.sqrt(observed.reduce((sum, v) => sum + (v-mean)**2, 0)/(n-1));
  if (!Number.isFinite(value)) throw new Error('Numeric overflow in aggregation');
  return {value, n};
}

export function aggregateAt(panel, state, time, variable) {
  return summarize(state.included.map(index => cell(panel, panel.entities[index], time, variable).value), state.aggregation);
}

export function viewRows(panel, state, cross, {rowStart=0,rowEnd=Infinity,columnStart=0,columnEnd=Infinity} = {}) {
  const columns = cross ? variableIndexes(panel,state) : panel.times;
  const entities = state.aggregation === 'none' ? state.included : [null];
  return entities.slice(rowStart,rowEnd).map(entityIndex => ({
    entityIndex,
    cells: columns.slice(columnStart,columnEnd).map((_, column) => {
      const c = coordinateAt(panel, state, column+columnStart, cross);
      const time = panel.times[c.time], variable = panel.variables[c.variable];
      if (entityIndex === null) return aggregateAt(panel, state, time, variable);
      const data = cell(panel, panel.entities[entityIndex], time, variable);
      return {...data, n:data.value === null ? 0 : 1};
    })
  }));
}

export const SUMMARY_COLUMNS = ['n','missing','absent','mean','sd','min','q25','median','q75','max'];
// Raw observations, not means of per-entity means. Quantiles use linear interpolation (type 7).
export function summaryTable(panel, state, scope = 'all') {
  const names = new Set(state.included.map(i => panel.entities[i]));
  const time = panel.times[state.time];
  const records = [...panel.records.values()].filter(r => names.has(r.entity) && (scope === 'all' || r.time === time));
  const absent = names.size * (scope === 'all' ? panel.times.length : 1) - records.length;
  return variableIndexes(panel,state).map(index => {
    const variable = panel.variables[index];
    const values = records.map(r => r.values[variable]).filter(v => v !== null).sort((a,b) => a-b);
    const n = values.length;
    const quantile = p => {
      if (!n) return null;
      const h = (n-1)*p, lo = Math.floor(h), hi = Math.ceil(h);
      return values[lo]*(1-(h-lo)) + values[hi]*(h-lo);
    };
    return {variable,n,missing:records.length-n,absent,
      mean:n ? summarize(values,'mean').value : null, sd:n>1 ? summarize(values,'sd').value : null,
      min:n ? values[0] : null,q25:quantile(.25),median:quantile(.5),q75:quantile(.75),max:n ? values.at(-1) : null};
  });
}

// Chart data is also exported. There is no fitting, smoothing, imputation or inference.
export function chartData(panel, state, {type, scope, xVariable, yVariable = panel.variables[state.variable]}) {
  const cross = panel.kind === 'cross-section';
  if (cross && type === 'line') throw new Error('Cross-sectional data has no time axis. Choose a bar chart, scatter or histogram.');
  const aggregated = state.aggregation !== 'none';
  const variable = yVariable;
  if (!panel.variables.includes(variable)) throw new Error('Choose a Y variable from this dataset.');
  if (type === 'scatter' && !panel.variables.includes(xVariable)) throw new Error('Choose an X variable from this dataset.');
  const entities = scope === 'selected' ? [state.entity] : state.included;
  if (type === 'scatter' && aggregated) throw new Error('Scatter requires raw observations.');
  if (type === 'line' && !aggregated && entities.length > 8) throw new Error('Select at most 8 entities for a line chart, or use an aggregation.');
  const indexes = aggregated ? [null] : entities;
  const positions = indexes.length * (((type === 'bar' || type === 'scatter') && !aggregated) ? 1 : panel.times.length);
  if (positions > 12000) throw new Error('Figure exceeds 12,000 positions. Select fewer entities or aggregate.');
  const series = indexes.map(index => {
    const name = index === null ? state.aggregation : panel.entities[index];
    const times = (type === 'bar' || type === 'scatter') && !aggregated ? [panel.times[state.time]] : panel.times;
    return {name, points:times.map(time => {
      const data = index === null ? aggregateAt(panel, state, time, variable) : cell(panel, name, time, variable);
      let x = time;
      if (type === 'bar' && !aggregated) x = name;
      if (type === 'bar' && aggregated) x = cross ? state.aggregation : timeLabel(panel, time);
      if (type === 'scatter') x = cell(panel, name, time, xVariable).value;
      return {time:cross ? null : time, x, y:data.value, n:data.n ?? (data.value === null ? 0 : 1)};
    })};
  });
  const inputCount = series.reduce((n, s) => n + s.points.length, 0);
  const plottedCount = series.reduce((n, s) => n + s.points.filter(p => p.y !== null && p.x !== null).length, 0);
  if (!plottedCount) throw new Error('No observed values in this selection.');
  if (type === 'bar' && inputCount > 40) throw new Error('Select at most 40 bars.');
  const xlabel = type === 'scatter' ? xVariable : type === 'histogram' ? variable : type === 'bar' && !aggregated ? panel.entityColumn : cross ? 'Statistic' : panel.timeColumn;
  const ylabel = type === 'histogram' ? 'Frequency' : aggregated ? `${state.aggregation}(${variable})` : variable;
  return {type, series, xlabel, ylabel, timeFormat:panel.timeFormat ?? null, metadata:{
    structure:panel.kind ?? 'panel', timeFormat:panel.timeFormat ?? 'number',
    aggregation:state.aggregation, variable, xVariable:type === 'scatter' ? xVariable : null,
    entities:(aggregated ? state.included : entities).map(i => panel.entities[i]),
    times:cross ? [] : ((type === 'bar' || type === 'scatter') && !aggregated ? [panel.times[state.time]] : panel.times).map(time => timeLabel(panel, time)),
    inputCount, plottedCount, omittedCount:inputCount-plottedCount,
    missingPolicy:'Exclude missing values; all-missing groups remain missing except count=0. SD uses n-1. Lines break at missing values.',
    inference:'Descriptive only. No confidence intervals, significance tests or smoothing.'
  }};
}
