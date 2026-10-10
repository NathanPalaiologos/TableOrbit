import {flatRecords,flatColumns,flatValues} from './flat.mjs';
import {setupToolbar} from './toolbar.mjs';
import { parseCSV, buildPanel, numericColumns, cell, columnTypes } from './data.mjs';
import { faceIndex, isCrossSection, layerValues, moveLayer, coordinateAt, variableIndexes } from './reader.mjs';
import { METHODS, aggregateAt, viewRows, summaryTable, SUMMARY_COLUMNS } from './analysis.mjs';
import { t, setLanguage, getLanguage, translateDOM, errorText, textFields } from './i18n.mjs';
import { setupFigures } from './figures.mjs';
import { parseFile, importTable, combinePanels } from './import.mjs';
import { parseTime, timeLabel } from './time.mjs';
import { MAX_BYTES, PAGE_ROWS, PAGE_COLUMNS } from './limits.mjs';
import { readerCommand, moveCell, acceptsRepeat } from './interaction.mjs';
import { suggestMapping, detectTimeFormats } from './detect.mjs';
import { setupComposer } from './composer.mjs';
import { setupScanner } from './scanner.mjs';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
setupToolbar({vscode});
const state = { turn:0, entity:0, time:0, variable:0, aggregation:'none', included:[] };
let flatMode=false, flatCell={row:0,column:0};
let summaryMode = false, dataTurn = 0, rowPage = 0, columnPage = 0, datasetId = 'grunfeld', importSerial = 0;
const sessions = new Map();
let scopeDraft = new Set();
let panel, demoText, parsedImport, importName, currentName, messageTimer, rotationTimer, layerTimer;
let rotatingNow = false, lastRepeatAt = 0;
let importSuggestion = null, mappingEdited = false, rowIdOptionValue = '';
let importTypes = [];
const faces = [...document.querySelectorAll('.face')];
const figureUI = setupFigures({getContext:() => ({panel, state:flatMode?{...state,aggregation:'none'}:state, name:currentName}), vscode});
const composerUI = setupComposer({openResult:prepareImport});
const scannerUI = setupScanner({vscode,openResult:prepareImport});
try { setLanguage(localStorage.getItem('panel-space-language')); } catch { /* storage is optional */ }

function applyLanguage() {
  document.documentElement.lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
  document.title = getLanguage() === 'zh' ? 'TableOrbit — 数据阅读器' : 'TableOrbit — Data reader';
  $('language').value = getLanguage();
  translateDOM();
  $('aggregation').replaceChildren(...METHODS.map(method => new Option(t(method), method)));
  if (panel) render();
  if (parsedImport && $('mapping-dialog').open) { updateImportVariables(); updateDetectionNote(); }
  figureUI.translate();
  composerUI.translate();
  scannerUI.translate();
}
$('language').addEventListener('change', () => {
  setLanguage($('language').value);
  try { localStorage.setItem('panel-space-language', getLanguage()); } catch { /* optional */ }
  applyLanguage();
});
applyLanguage();
$('open-guide').addEventListener('click', () => $('guide-dialog').showModal());
$('close-guide').addEventListener('click', () => $('guide-dialog').close());

function message(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { $('message').hidden = true; }, 5000);
}
function installPanel(next, name, id = `import-${++importSerial}`) {
  panel = next;
  currentName = name;
  datasetId = id;
  summaryMode = false; flatMode=false; flatCell={row:0,column:0}; dataTurn = 0; rowPage = 0; columnPage = 0;
  $('summary-scope').value = 'all';
  sessions.set(id, {panel:next,name});
  if (![...$('example').options].some(option => option.value === id)) $('example').add(new Option(name,id));
  $('example').value = id;
  // Bound retained in-memory datasets. Bundled examples can always be loaded again.
  while (sessions.size > 5) {
    const oldest = sessions.keys().next().value;
    sessions.delete(oldest);
    if (oldest.startsWith('import-')) [...$('example').options].find(o => o.value === oldest)?.remove();
  }
  Object.assign(state, {turn:0, entity:0, time:0, variable:0, aggregation:'none', included:panel.entities.map((_, i) => i),visibleVariables:panel.variables.map((_,i) => i)});
  finishRotation();
  stopLayerMotion();
  $('reader').classList.add('resting');
  $('filename').textContent = name;
  faces.forEach(face => { face.scrollTop = 0; face.scrollLeft = 0; });
  // Opening a new file resets immediately; only intentional rotations animate.
  $('cube').style.transition = 'none';
  render();
  void $('cube').offsetWidth;
  $('cube').style.transition = '';
  if (!document.activeElement?.matches('select,input,textarea,button')) $('reader').focus();
}
function tableHTML(cross) {
  const columns = cross ? variableIndexes(panel,state).map(i => panel.variables[i]) : panel.times.map(time => timeLabel(panel, time));
  const start = columnPage * PAGE_COLUMNS;
  const rows = viewRows(panel, state, cross, {rowStart:rowPage*PAGE_ROWS,rowEnd:(rowPage+1)*PAGE_ROWS,columnStart:start,columnEnd:start+PAGE_COLUMNS}).map(row => {
    const cells = row.cells.map((data, ci) => {
      const text = data.absent ? t('absent') : data.value === null ? t('missing') : String(data.value);
      return `<td role="gridcell" tabindex="-1" data-entity="${row.entityIndex ?? -1}" data-column="${ci+start}" title="n = ${data.n}" class="${data.value === null ? 'missing' : ''}">${escapeHTML(text)}</td>`;
    }).join('');
    return `<tr><th scope="row">${escapeHTML(row.entityIndex === null ? t(state.aggregation) : panel.entities[row.entityIndex])}</th>${cells}</tr>`;
  }).join('');
  return `<table role="grid" class="${cross ? 'cross' : 'series'}" aria-label="${t(cross ? 'cross' : 'series')}"><thead><tr><th scope="col">${escapeHTML(panel.entityLabelKey ? t(panel.entityLabelKey) : panel.entityColumn)} / ${cross ? t('variables') : escapeHTML(panel.timeColumn)}</th>${columns.slice(start,start+PAGE_COLUMNS).map(column => `<th scope="col">${escapeHTML(column)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function renderFlat(records) {
  const columns=flatColumns(panel,state),start=columnPage*PAGE_COLUMNS;
  flatCell.row=Math.max(0,Math.min(flatCell.row,records.length-1));
  flatCell.column=Math.min(flatCell.column,columns.length-1);
  $('flat-table').innerHTML=`<table role="grid" aria-label="${t('flatView')}"><thead><tr>${columns.slice(start,start+PAGE_COLUMNS).map(name=>`<th>${escapeHTML(name)}</th>`).join('')}</tr></thead><tbody>${records.slice(rowPage*PAGE_ROWS,(rowPage+1)*PAGE_ROWS).map((record,index)=>`<tr>${flatValues(panel,state,record).slice(start,start+PAGE_COLUMNS).map((value,column)=>{
    const selected=flatCell.row===index+rowPage*PAGE_ROWS && flatCell.column===column+start;
    return `<td role="gridcell" tabindex="-1" data-flat-row="${index+rowPage*PAGE_ROWS}" data-flat-column="${column+start}" aria-selected="${selected}" class="${selected?'selected':''}">${escapeHTML(value===null?t('missing'):String(value))}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}
function selectFlat(row,column) {
  const records=flatRecords(panel,state),columns=flatColumns(panel,state);
  flatCell={row:Math.max(0,Math.min(row,records.length-1)),column:Math.max(0,Math.min(column,columns.length-1))};
  const record=records[flatCell.row];
  if(record){state.entity=panel.entities.indexOf(record.entity);state.time=panel.times.indexOf(record.time);
    const variable=panel.variables.indexOf(columns[flatCell.column]);if(variable>=0)state.variable=variable;}
  rowPage=Math.floor(flatCell.row/PAGE_ROWS);columnPage=Math.floor(flatCell.column/PAGE_COLUMNS);
  render();
  const td=$('flat-table').querySelector('td.selected');td?.focus({preventScroll:true});td?.scrollIntoView({block:'nearest',inline:'nearest'});
}
$('flat-table').addEventListener('click',event=>{
  const td=event.target.closest('td[data-flat-row]');if(td)selectFlat(Number(td.dataset.flatRow),Number(td.dataset.flatColumn));
});
function renderSummary() {
  const rows = summaryTable(panel,state,$('summary-scope').value);
  const format = value => value === null ? t('missing') : Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(7)));
  $('summary-table').innerHTML = `<table aria-label="${t('summary')}"><thead><tr><th>${t('variables')}</th>${SUMMARY_COLUMNS.map(key => `<th>${t(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th>${escapeHTML(row.variable)}</th>${SUMMARY_COLUMNS.map(key => `<td title="${row[key] ?? ''}">${format(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function updateKeyboardHint() {
  const key = flatMode ? 'flatKeys' : summaryMode ? ($('summary-scope').value === 'all' ? 'allPeriods' : 'currentPeriod')
    : !$('reader').contains(document.activeElement) ? 'activateReader'
    : panel.kind === 'cross-section' ? 'crossKeys' : 'keys';
  const keys = key === 'keys' ? ['keyLayers','keyRotate','keyCells'] : key === 'crossKeys' ? ['cross','keyCells'] : [key];
  textFields($('key-hint'),keys.map(t));
}
document.addEventListener('focusin', () => { if (panel) updateKeyboardHint(); });
function render() {
  const cross = isCrossSection(state);
  const key = cross ? 'time' : 'variable';
  const values = layerValues(panel, state);
  const position = cross ? state.time : variableIndexes(panel,state).indexOf(state.variable);
  document.querySelector('.layer-controls').hidden = flatMode || panel.kind === 'cross-section' || (summaryMode && $('summary-scope').value === 'all');
  document.querySelector('.face-controls').hidden = summaryMode || flatMode;
  document.querySelector('.navigation').hidden = flatMode || (summaryMode && panel.kind === 'cross-section');
  $('summary-scope-control').hidden = !summaryMode || panel.kind === 'cross-section';
  $('summary-note').hidden = !summaryMode;
  $('summary-table').hidden = !summaryMode;
  $('cube').hidden = summaryMode || flatMode;
  $('flat-table').hidden=!flatMode;
  $('toggle-flat').textContent=t(flatMode?'orbitView':'flatView');
  $('toggle-flat').setAttribute('aria-pressed',String(flatMode));
  $('aggregation-control').hidden = summaryMode || flatMode;
  $('toggle-summary').textContent = t(summaryMode ? 'dataView' : 'summary');
  $('toggle-summary').setAttribute('aria-pressed',String(summaryMode));
  $('open-figure').disabled = summaryMode;
  document.querySelector('.selection-bar').hidden = summaryMode || flatMode;
  $('variable-count').textContent = `${state.visibleVariables.length} / ${panel.variables.length}`;
  updateKeyboardHint();
  $('reader').setAttribute('aria-label', t(flatMode?'flatKeys':summaryMode ? 'summary' : panel.kind === 'cross-section' ? 'crossKeys' : 'reader'));
  for (const id of ['rotate-left','rotate-right']) $(id).disabled = panel.kind === 'cross-section';
  $('view-name').textContent = t(cross ? 'cross' : 'series');
  $('layer-label').textContent = cross ? panel.timeColumn : t('variables');
  $('aggregation').value = state.aggregation;
  $('scope-count').textContent = `${state.included.length} / ${panel.entities.length}`;
  $('aggregation-note').textContent = state.aggregation === 'none' || summaryMode || flatMode ? '' : t('aggregateNote');
  textFields($('dataset-meta'),[`${panel.rowCount} ${t('records')}`,`${state.included.length}/${panel.entities.length} ${t('entities')}`,...(panel.kind === 'cross-section' ? [] : [`${panel.times.length} ${t('periods')}`]),`${panel.variables.length} ${t('variables')}`]);
  const labels = values.map(value => cross ? timeLabel(panel,value) : value);
  if ($('layer-select').options.length !== labels.length || labels.some((label,index) => $('layer-select').options[index]?.text !== String(label))) {
    $('layer-select').replaceChildren(...labels.map((value,index) => new Option(String(value),String(index))));
  }
  $('layer-select').value = String(position);
  $('layer-count').textContent = `${position + 1} / ${values.length}`;
  $('previous-layer').disabled = position === 0;
  $('next-layer').disabled = position === values.length - 1;
  const records=flatMode?flatRecords(panel,state):null;
  const totalRows = flatMode?records.length:state.aggregation === 'none' ? state.included.length : 1;
  const totalColumns = flatMode?flatColumns(panel,state).length:cross ? state.visibleVariables.length : panel.times.length;
  rowPage = Math.max(0,Math.min(rowPage,Math.ceil(totalRows/PAGE_ROWS)-1));
  columnPage = Math.min(columnPage,Math.ceil(totalColumns/PAGE_COLUMNS)-1);
  $('table-pages').hidden = summaryMode || (totalRows <= PAGE_ROWS && totalColumns <= PAGE_COLUMNS);
  for (const [axis,page,total,size] of [['rows',rowPage,totalRows,PAGE_ROWS],['cols',columnPage,totalColumns,PAGE_COLUMNS]]) {
    $(`${axis}-range`).textContent = `${page*size+1}–${Math.min((page+1)*size,total)} / ${total}`;
    $(`${axis}-prev`).disabled = page === 0;
    $(`${axis}-next`).disabled = (page+1)*size >= total;
  }
  if (summaryMode) { renderSummary(); return; }
  if (flatMode) { renderFlat(records); return; }
  faces.forEach((face, index) => {
    const left = face.scrollLeft, top = face.scrollTop;
    // At most two bounded pages during a rotation, never four complete datasets.
    if (index === faceIndex(state.turn)) face.innerHTML = tableHTML(cross);
    else if ($('reader').classList.contains('resting')) face.replaceChildren();
    face.inert = index !== faceIndex(state.turn);
    face.setAttribute('aria-hidden', String(face.inert));
    face.scrollLeft = left;
    face.scrollTop = top;
  });
  $('cube').style.setProperty('--angle', `${-90 * state.turn}deg`);
  renderSelection();
}
function renderSelection() {
  faces.forEach((face, index) => {
    const column = index % 2 === 0 ? variableIndexes(panel,state).indexOf(state.variable) : state.time;
    face.querySelectorAll('td').forEach(td => {
      const selected = (state.aggregation !== 'none' || Number(td.dataset.entity) === state.entity) && Number(td.dataset.column) === column;
      td.classList.toggle('selected', selected);
      td.setAttribute('aria-selected', String(selected));
      td.tabIndex = -1; // One keyboard entry point for the reader; selected cells are focused programmatically.
    });
  });
  const entity = panel.entities[state.entity], time = panel.times[state.time], variable = panel.variables[state.variable];
  const aggregated = state.aggregation !== 'none';
  const data = aggregated ? aggregateAt(panel, state, time, variable) : cell(panel, entity, time, variable);
  $('coordinate').textContent = `${aggregated ? t(state.aggregation) : entity}${panel.kind === 'cross-section' ? '' : ' / ' + timeLabel(panel, time)} / ${variable}${aggregated ? ` (n = ${data.n} / ${state.included.length})` : ''}`;
  $('cell-value').textContent = data.absent ? t('absent') : data.value === null ? t('missing') : String(data.value);
}
function revealSelection() {
  const face = faces[faceIndex(state.turn)];
  const td = face.querySelector('td.selected');
  if (!td) return;
  const rowHeader = face.querySelector('tbody th').offsetWidth;
  const colHeader = face.querySelector('thead').offsetHeight;
  if (td.offsetLeft < face.scrollLeft + rowHeader) face.scrollLeft = td.offsetLeft - rowHeader;
  if (td.offsetLeft + td.offsetWidth > face.scrollLeft + face.clientWidth) face.scrollLeft = td.offsetLeft + td.offsetWidth - face.clientWidth;
  if (td.offsetTop < face.scrollTop + colHeader) face.scrollTop = td.offsetTop - colHeader;
  if (td.offsetTop + td.offsetHeight > face.scrollTop + face.clientHeight) face.scrollTop = td.offsetTop + td.offsetHeight - face.clientHeight;
}
function finishRotation() {
  clearTimeout(rotationTimer);
  rotatingNow = false;
  $('reader').classList.add('resting');
  faces.forEach((face,index) => { if (index !== faceIndex(state.turn)) face.replaceChildren(); });
}
function navigate(key, fromKeyboard = false) {
  if (!panel || panel.kind === 'cross-section') return;
  const rotating = key === 'ArrowLeft' || key === 'ArrowRight';
  if (summaryMode && (rotating || $('summary-scope').value === 'all')) return;
  const selectedHadFocus = fromKeyboard && document.activeElement?.matches('td[data-column]');
  stopLayerMotion();
  finishRotation();
  const before = isCrossSection(state) ? state.time : state.variable;
  if (rotating && $('reader').classList.contains('resting')) {
    $('cube').style.transition = 'none';
    $('reader').classList.remove('resting');
    void $('cube').offsetWidth;
    $('cube').style.transition = '';
  }
  if (key === 'ArrowLeft') state.turn--;
  if (key === 'ArrowRight') state.turn++;
  if (key === 'ArrowUp') moveLayer(panel, state, -1);
  if (key === 'ArrowDown') moveLayer(panel, state, 1);
  if (!rotating && before === (isCrossSection(state) ? state.time : state.variable)) return;
  if (rotating) columnPage = Math.floor((isCrossSection(state) ? variableIndexes(panel,state).indexOf(state.variable) : state.time) / PAGE_COLUMNS);
  render();
  revealSelection();
  const after = isCrossSection(state) ? state.time : state.variable;
  if (!rotating && before !== after) animateLayer(after > before);
  if (rotating) {
    rotatingNow = true;
    clearTimeout(rotationTimer);
    // Flatten at rest: Chromium hit-testing of scrollable 3D faces is unreliable.
    // The settled reader is an ordinary table with ordinary selection/scrolling.
    rotationTimer = setTimeout(() => {
      finishRotation();
      revealSelection();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }
  if (fromKeyboard) (selectedHadFocus ? faces[faceIndex(state.turn)].querySelector('td.selected') ?? $('reader') : $('reader')).focus({preventScroll:true});
}
$('reader').addEventListener('keydown', event => {
  if(flatMode){
    if(!event.key.startsWith('Arrow') || event.defaultPrevented || event.keyCode===229 || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || document.querySelector('dialog[open]') || event.target.closest('input,select,textarea,button,[contenteditable]'))return;
    event.preventDefault();event.stopPropagation();
    if(!acceptsRepeat('cell',event,performance.now()-lastRepeatAt))return;
    lastRepeatAt=performance.now();
    selectFlat(flatCell.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),flatCell.column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0));return;
  }
  const command = readerCommand(event,{nativeControl:!!event.target.closest('input,select,textarea,button,[contenteditable]:not([contenteditable="false"])'),modal:!!document.querySelector('dialog[open]'),summary:summaryMode,currentPeriod:$('summary-scope').value === 'current',crossOnly:panel?.kind === 'cross-section'});
  if (!command || !panel) return;
  event.preventDefault(); event.stopPropagation();
  // Consume held rotation keys without rotating again or scrolling the table.
  if (!acceptsRepeat(command,event,performance.now()-lastRepeatAt)) return;
  lastRepeatAt = performance.now();
  if (command === 'cell') {
    finishRotation(); stopLayerMotion();
    if (!moveCell(panel,state,event.key)) return;
    const oldRowPage = rowPage, oldColumnPage = columnPage;
    rowPage = state.aggregation === 'none' ? Math.floor(state.included.indexOf(state.entity)/PAGE_ROWS) : 0;
    columnPage = Math.floor((isCrossSection(state) ? state.visibleVariables.indexOf(state.variable) : state.time)/PAGE_COLUMNS);
    if (oldRowPage !== rowPage || oldColumnPage !== columnPage) render(); else renderSelection();
    revealSelection();
    (faces[faceIndex(state.turn)].querySelector('td.selected') ?? $('reader')).focus({preventScroll:true});
  } else {
    navigate(event.key,true);
  }
});
function stopLayerMotion() {
  clearTimeout(layerTimer);
  $('layer-motion').hidden = true;
  $('layer-motion').getAnimations().forEach(animation => animation.cancel());
}
function animateLayer(forward) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Only the edge indicator fades. Table position, text size and opacity stay fixed.
  $('layer-motion').className = forward ? 'forward' : 'backward';
  $('layer-motion').hidden = false;
  $('layer-motion').animate([{opacity:.65}, {opacity:0}], {duration:160, easing:'ease-out'});
  layerTimer = setTimeout(stopLayerMotion, 170);
}
$('reader').addEventListener('click', event => {
  const td = event.target.closest('td[data-column]');
  if (!td || td.closest('.face').inert) return;
  if (rotatingNow) finishRotation();
  if (state.aggregation === 'none') state.entity = Number(td.dataset.entity);
  Object.assign(state, coordinateAt(panel, state, Number(td.dataset.column)));
  renderSelection();
  td.focus({preventScroll:true});
});
for (const [id, key] of Object.entries({'rotate-left':'ArrowLeft','rotate-right':'ArrowRight','previous-layer':'ArrowUp','next-layer':'ArrowDown'})) {
  $(id).addEventListener('click', () => navigate(key));
}
$('layer-select').addEventListener('change', () => {
  finishRotation();
  stopLayerMotion();
  const selected = Number($('layer-select').value);
  state[isCrossSection(state) ? 'time' : 'variable'] = isCrossSection(state) ? selected : state.visibleVariables[selected];
  render();
  revealSelection();
});
new ResizeObserver(entries => {
  $('cube').style.setProperty('--depth', `${entries[0].contentRect.width / 2}px`);
}).observe($('reader'));
for (const [id,axis,step] of [['rows-prev','row',-1],['rows-next','row',1],['cols-prev','column',-1],['cols-next','column',1]]) $(id).addEventListener('click', () => {
  if(flatMode){selectFlat(axis==='row'?(rowPage+step)*PAGE_ROWS:flatCell.row,axis==='column'?(columnPage+step)*PAGE_COLUMNS:flatCell.column);return;}
  if (axis === 'row') { rowPage += step; if (state.aggregation === 'none') state.entity = state.included[rowPage*PAGE_ROWS]; }
  else { columnPage += step; Object.assign(state,coordinateAt(panel,state,columnPage*PAGE_COLUMNS)); }
  render();
});
$('toggle-summary').addEventListener('click', () => {
  if(flatMode){flatMode=false;rowPage=0;columnPage=0;}
  summaryMode = !summaryMode;
  finishRotation(); stopLayerMotion();
  if (summaryMode) { dataTurn = state.turn; state.turn = 0; }
  else { state.turn = dataTurn; columnPage = Math.floor((isCrossSection(state) ? variableIndexes(panel,state).indexOf(state.variable) : state.time)/PAGE_COLUMNS); }
  render();
});
$('summary-scope').addEventListener('change',render);
$('toggle-flat').addEventListener('click',()=>{
  finishRotation();stopLayerMotion();
  if(summaryMode){summaryMode=false;state.turn=dataTurn;}
  flatMode=!flatMode;
  if(flatMode){const records=flatRecords(panel,state);flatCell.row=Math.max(0,records.findIndex(r=>r.entity===panel.entities[state.entity] && r.time===panel.times[state.time]));flatCell.column=0;rowPage=Math.floor(flatCell.row/PAGE_ROWS);columnPage=0;}
  else{rowPage=Math.floor(Math.max(0,state.included.indexOf(state.entity))/PAGE_ROWS);columnPage=Math.floor((isCrossSection(state)?state.visibleVariables.indexOf(state.variable):state.time)/PAGE_COLUMNS);}
  render();$('reader').focus({preventScroll:true});
});

function prepareImport(text, name, defaults = {}) {
  try {
    parsedImport = parseFile(text, name);
    importName = name;
    importTypes = columnTypes(parsedImport);
    textFields($('import-info'),[name,`${parsedImport.rows.length} ${t('rowCount')}`]);
    importSuggestion = suggestMapping(parsedImport); mappingEdited = false;
    const suggested = importSuggestion.mapping ?? {};
    rowIdOptionValue = '__row_number__';
    while (parsedImport.headers.includes(rowIdOptionValue)) rowIdOptionValue += '_';
    for (const id of ['entity-column','time-column']) {
      const placeholder = new Option(t('chooseColumn'),''); placeholder.disabled = true;
      $(id).replaceChildren(placeholder,...parsedImport.headers.map(name => new Option(name, name)));
    }
    $('entity-column').add(new Option(t('rowIdOption'),rowIdOptionValue));
    $('entity-column').value = suggested.entity ?? '';
    $('time-column').value = suggested.time ?? '';
    $('import-mode').value = defaults.mode ?? suggested.mode ?? 'panel';
    $('time-format').value = suggested.timeFormat ?? '';
    $('entity-name').value = name.replace(/\.[^.]+$/, '');
    $('measure-name').value = defaults.measure ?? '';
    $('append-series').checked = false;
    updateImportVariables();
    updateDetectionNote();
    $('import-error').textContent = '';
    $('open-dialog').close();
    $('mapping-dialog').showModal();
  } catch (error) {
    if ($('open-dialog').open) $('paste-error').textContent = errorText(error);
    else message(errorText(error));
  }
}
function updateDetectionNote() {
  const candidates = !mappingEdited && importSuggestion?.reason === 'detectMultiple'
    ? importSuggestion.candidates.slice(0,6).map(candidate => `${candidate.entity} / ${candidate.time}`).join(', ') : '';
  $('detection-note').textContent = t(mappingEdited ? 'detectEdited' : importSuggestion?.reason ?? 'detectUnknown') + (candidates ? ` ${candidates}` : '');
}
function updateImportVariables() {
  const mode = $('import-mode').value;
  const hasEntity = ['panel','cross-section'].includes(mode), hasTime = mode !== 'cross-section';
  $('entity-column').required = hasEntity;
  $('entity-column').options[$('entity-column').options.length-1].disabled = mode !== 'cross-section';
  if (mode !== 'cross-section' && $('entity-column').value === rowIdOptionValue) $('entity-column').value = '';
  const canAppend = ['series','wide'].includes(mode) && panel?.kind !== 'cross-section';
  $('append-control').hidden = !canAppend;
  $('append-note').hidden = !canAppend;
  if (!canAppend) $('append-series').checked = false;
  for (const [id, shown] of [['entity-column',hasEntity],['time-column',hasTime],['time-format',hasTime],['entity-name',mode === 'series'],['measure-name',mode === 'wide']]) {
    $(id).closest('label').hidden = !shown;
    $(id).disabled = !shown;
  }
  $('structure-note').textContent = t({panel:'panelNote','cross-section':'crossNote',series:'seriesNote',wide:'wideNote'}[mode]);
  $('variable-legend').textContent = t(mode === 'wide' ? 'seriesColumns' : 'numeric');
  const excluded = [...(hasEntity ? [$('entity-column').value] : []), ...(hasTime ? [$('time-column').value] : [])];
  const variables = numericColumns(parsedImport, excluded);
  const largeIntegers = new Set(importTypes.filter(profile => profile.type === 'typeLargeInteger').map(profile => profile.name));
  $('large-integer-note').hidden = !variables.some(name => largeIntegers.has(name));
  $('import-variables').innerHTML = variables.map(name => `<label><input type="checkbox" data-variable="${escapeHTML(name)}" ${largeIntegers.has(name) ? '' : 'checked'}> ${escapeHTML(name)}</label>`).join('') || t('noNumeric');
  $('column-types').innerHTML = importTypes.map(profile => `<div><strong>${escapeHTML(profile.name)}</strong><span>${t(profile.type)}${profile.missing ? ` (${profile.missing} ${t('missing')})` : ''}</span></div>`).join('');
  updateTimePreview();
}
function updateTimePreview() {
  $('time-preview').textContent = '';
  if ($('import-mode').value === 'cross-section') return;
  if (!$('time-column').value || !$('time-format').value) return;
  try {
    const labels = [...new Set(parsedImport.rows.map(row => parseTime(row[$('time-column').value], $('time-format').value).label))];
    $('time-preview').textContent = `${t('timePreview')}: ${labels.slice(0,3).join(', ')}${labels.length > 3 ? ' …' : ''}${$('time-format').value === 'timestamp' ? ' (UTC)' : ''}`;
  } catch (error) { $('time-preview').textContent = errorText(error); }
}
for (const id of ['entity-column','time-column','import-mode']) $(id).addEventListener('change', () => {
  mappingEdited = true;
  if (id === 'time-column') {
    const formats = detectTimeFormats(parsedImport,$('time-column').value);
    $('time-format').value = formats.length === 1 ? formats[0] : '';
  }
  updateImportVariables(); updateDetectionNote();
});
$('time-format').addEventListener('change', () => { mappingEdited = true; updateTimePreview(); updateDetectionNote(); });
$('cancel-import').addEventListener('click', () => $('mapping-dialog').close());
$('mapping-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const variables = [...document.querySelectorAll('[data-variable]:checked')].map(input => input.dataset.variable);
    let next = importTable(parsedImport, {mode:$('import-mode').value, entity:$('entity-column').value, time:$('time-column').value, variables,
      timeFormat:$('time-format').value, entityName:$('entity-name').value, measure:$('measure-name').value,rowId:$('import-mode').value === 'cross-section' && $('entity-column').value === rowIdOptionValue});
    const append = $('append-series').checked;
    if (append) next = combinePanels(panel, next);
    $('mapping-dialog').close();
    installPanel(next, append ? `${currentName} + ${importName}` : importName);
    parsedImport = null;
  } catch (error) { $('import-error').textContent = errorText(error); }
});
$('open-paste').addEventListener('click', () => { $('paste-error').textContent = ''; $('open-dialog').showModal(); });
$('open-csv').addEventListener('click', () => vscode ? vscode.postMessage({type:'openCsv'}) : $('file-input').click());
$('cancel-open').addEventListener('click', () => $('open-dialog').close());
$('paste-form').addEventListener('submit', event => {
  event.preventDefault();
  prepareImport($('paste-data').value, `pasted.${$('paste-format').value}`);
});
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (file) {
    if (file.size > MAX_BYTES) message(t('tooLarge'));
    else prepareImport(await file.text(), file.name);
  }
  event.target.value = '';
});
async function loadDemo() {
  const example = $('example').value;
  const initiatedBySwitcher = document.activeElement === $('example');
  $('example').disabled = true;
  try {
    if (sessions.has(example)) {
      const saved = sessions.get(example);
      installPanel(saved.panel,saved.name,example);
    } else if (example !== 'grunfeld') {
      const filename = {gapminder:'gapminder.tsv',nlswork:'nlswork.csv'}[example];
      const response = await fetch(new URL(`./data/${filename}`, import.meta.url));
      if (!response.ok) throw new Error('Could not load example data.');
      const parsed = parseFile(await response.text(),filename);
      const mapping = {
        gapminder:{entity:'country',time:'year',variables:['lifeExp','pop','gdpPercap']},
        nlswork:{entity:'idcode',time:'year',variables:numericColumns(parsed,['idcode','year'])}
      }[example];
      installPanel(importTable(parsed,mapping),filename,example);
    } else {
      const parsed = parseCSV(demoText);
      installPanel(buildPanel(parsed, 'firm', 'year', numericColumns(parsed, ['firm','year'])), 'grunfeld.csv','grunfeld');
    }
  } catch (error) {
    $('example').value = datasetId;
    message(errorText(error));
  } finally {
    $('example').disabled = false;
    if (initiatedBySwitcher && (document.activeElement === document.body || document.activeElement === $('reader'))) $('example').focus({preventScroll:true});
  }
}
$('example').addEventListener('change', loadDemo);
$('aggregation').addEventListener('change', () => {
  finishRotation();
  stopLayerMotion();
  state.aggregation = $('aggregation').value;
  render();
});
function renderScopeList() {
  const query = $('scope-search').value.toLowerCase();
  const matches = panel.entities.map((entity,index) => ({entity,index})).filter(r => r.entity.toLowerCase().includes(query));
  $('scope-entities').innerHTML = matches.slice(0,200).map(({entity,index}) => `<label><input type="checkbox" value="${index}" ${scopeDraft.has(index) ? 'checked' : ''}> ${escapeHTML(entity)}</label>`).join('');
  textFields($('scope-list-note'),[`${t('showing')} ${Math.min(200,matches.length)} / ${matches.length}`,`${scopeDraft.size} ${t('selectedCount')}`]);
}
$('scope-search').addEventListener('input',renderScopeList);
$('scope-entities').addEventListener('change',event => {
  const index = Number(event.target.value);
  if (event.target.checked) scopeDraft.add(index); else scopeDraft.delete(index);
  renderScopeList();
});
$('open-scope').addEventListener('click', () => {
  scopeDraft = new Set(state.included); $('scope-search').value = ''; renderScopeList();
  $('scope-error').textContent = '';
  $('scope-dialog').showModal();
});
for (const [id, checked] of [['scope-all',true], ['scope-clear',false]]) {
  $(id).addEventListener('click', () => { scopeDraft = new Set(checked ? panel.entities.map((_,i) => i) : []); renderScopeList(); });
}
$('scope-cancel').addEventListener('click', () => $('scope-dialog').close());
$('scope-form').addEventListener('submit', event => {
  event.preventDefault();
  const included = [...scopeDraft].sort((a,b) => a-b);
  if (!included.length) { $('scope-error').textContent = t('needEntity'); return; }
  state.included = included;
  rowPage = 0;
  if (!included.includes(state.entity)) state.entity = included[0];
  stopLayerMotion();
  render();
  $('scope-dialog').close();
  $('open-scope').focus({preventScroll:true});
});
function filterVariableList() {
  const query = $('variables-search').value.toLowerCase();
  $('variable-list').querySelectorAll('label').forEach(label => { label.hidden = !label.textContent.toLowerCase().includes(query); });
}
$('open-variables').addEventListener('click', () => {
  $('variables-search').value = '';
  $('variable-list').innerHTML = panel.variables.map((variable,index) => `<label><input type="checkbox" value="${index}" ${state.visibleVariables.includes(index) ? 'checked' : ''}> ${escapeHTML(variable)}</label>`).join('');
  $('variables-error').textContent = ''; $('variables-dialog').showModal();
});
$('variables-search').addEventListener('input',filterVariableList);
for (const [id,checked] of [['variables-all',true],['variables-clear',false]]) $(id).addEventListener('click', () => {
  $('variable-list').querySelectorAll('input').forEach(input => { input.checked = checked; });
});
$('variables-cancel').addEventListener('click', () => $('variables-dialog').close());
$('variables-form').addEventListener('submit', event => {
  event.preventDefault();
  const indexes = [...$('variable-list').querySelectorAll('input:checked')].map(input => Number(input.value));
  if (!indexes.length) { $('variables-error').textContent = t('needVariable'); return; }
  state.visibleVariables = indexes;
  if (!indexes.includes(state.variable)) state.variable = indexes[0];
  columnPage = 0; render(); $('variables-dialog').close(); $('open-variables').focus({preventScroll:true});
});
$('export-button').addEventListener('click', () => {
  if (!panel) return;
  const cross = isCrossSection(state);
  const columns = cross ? state.visibleVariables.map(i => panel.variables[i]) : panel.times.map(time => timeLabel(panel, time));
  const aggregated = state.aggregation !== 'none';
  const headers = aggregated ? columns.flatMap(column => [column, `${column}_n`]) : columns;
  const rows = flatMode?[flatColumns(panel,state),...flatRecords(panel,state).map(r=>flatValues(panel,state,r))]:summaryMode ? [['variable',...SUMMARY_COLUMNS],...summaryTable(panel,state,$('summary-scope').value).map(row => [row.variable,...SUMMARY_COLUMNS.map(key => row[key])])] : [[panel.entityColumn, ...headers], ...viewRows(panel, state, cross).map(row => [
    row.entityIndex === null ? state.aggregation : panel.entities[row.entityIndex],
    ...row.cells.flatMap(data => aggregated ? [data.value, data.n] : [data.value])
  ])];
  const quote = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  const text = '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
  const layer = flatMode?'flat':summaryMode ? `summary-${$('summary-scope').value}${$('summary-scope').value === 'current' ? '-'+timeLabel(panel,panel.times[state.time]) : ''}` : panel.kind === 'cross-section' ? 'cross-section' : cross ? timeLabel(panel, panel.times[state.time]) : panel.variables[state.variable];
  const name = `${currentName.replace(/\.[^.]+$/, '')}-${layer}-${summaryMode || flatMode ? 'raw' : state.aggregation}.csv`.replace(/[<>:"/\\|?*]/g, '_');
  if (vscode) { vscode.postMessage({type:'export', text, name}); return; }
  const url = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('message', event => {
  if (event.data?.type === 'parquet' && typeof event.data.path === 'string') scannerUI.inspect(event.data.path);
  if (event.data?.type === 'csv' && typeof event.data.text === 'string') prepareImport(event.data.text, event.data.name);
  if (event.data?.type === 'exported') message(t('saved'));
});
try {
  const boot = window.__PANEL_BOOT__;
  demoText = boot?.demo ?? await fetch(new URL('./data/grunfeld.csv', import.meta.url)).then(response => {
    if (!response.ok) throw new Error('Could not load example data.');
    return response.text();
  });
  loadDemo();
  if (boot?.csv) prepareImport(boot.csv, boot.name);
  if (boot?.parquet || scannerUI.initial) scannerUI.inspect(boot?.parquet || scannerUI.initial);
} catch (error) { message(errorText(error)); console.error(error); }
