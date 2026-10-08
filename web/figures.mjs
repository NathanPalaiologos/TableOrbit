import { chartData } from './analysis.mjs';
import { t, getLanguage, translateDOM, errorText, textFields } from './i18n.mjs';
import { timeLabel } from './time.mjs';
const $ = id => document.getElementById(id);
const PRESETS = {
  nature:{en:'Widths of 89 or 183 mm with Arial at 7 pt and 0.8 pt lines. SVG text stays editable and PDF fonts are embedded. Based on Nature final-figure guidance.',zh:'宽度为 89 或 183 mm，使用 Arial 7 pt 和 0.8 pt 线宽。SVG 文字可编辑，PDF 嵌入字体。参考 Nature 最终图件指南。',url:'https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/'},
  seaborn:{en:'Widths of 89 or 178 mm with Seaborn ticks, paper context, 8 pt text and light gridlines. This is a library style, not a journal standard.',zh:'宽度为 89 或 178 mm，使用 Seaborn ticks 和 paper 设置、8 pt 字号及淡网格。这是绘图库风格，不是期刊标准。',url:'https://seaborn.pydata.org/tutorial/aesthetics.html'},
  icml:{en:'Widths of 82.55 or 171.45 mm with Times New Roman at 8 pt and lines of at least 0.6 pt. Titles stay outside the figure. Widths follow ICML 2026 columns. Typography is our preset.',zh:'宽度为 82.55 或 171.45 mm，使用 Times New Roman 8 pt，线宽不低于 0.6 pt。标题放在图外。宽度参考 ICML 2026 栏宽，字体为本工具预设。',url:'https://media.icml.cc/Conferences/ICML2026/Styles/example_paper.pdf'},
  aer:{en:'Widths of 86 or 178 mm with Times New Roman at 9 pt. Monochrome lines use distinct markers and styles. AER requires vector figures. Width and typography are our economics preset.',zh:'宽度为 86 或 178 mm，使用 Times New Roman 9 pt，以点形与线型区分黑白曲线。AER 要求矢量图，宽度和字体为本工具经济学预设。',url:'https://www.aeaweb.org/journals/aer/style-guide'},
};
const MIME = {svg:'image/svg+xml', pdf:'application/pdf', png:'image/png', json:'application/json'};

export function setupFigures({getContext, vscode}) {
  let result = null, recipe = null, pending = null, requestId = 0, dirty = true, rendering = false;
  let customEntities = new Set();
  let entityMatchCount = 0;
  function status(text) { $('figure-status').textContent = text; }
  function clearExports() {
    result = null; recipe = null; dirty = true;
    document.querySelectorAll('[data-format]').forEach(button => { button.disabled = true; });
  }
  function templateInfo() {
    const preset = PRESETS[$('plot-template').value];
    $('template-spec').textContent = preset[getLanguage()];
    $('template-source').href = preset.url;
    $('template-source').textContent = getLanguage() === 'zh' ? '出版方 / 库文档' : 'Publisher / library documentation';
  }
  function getData() {
    const {panel, state} = getContext();
    const scope = $('plot-scope').value;
    const figureState = {...state,time:Number($('plot-time').value)};
    if (scope === 'selected' && state.aggregation === 'none') {
      figureState.entity = panel.entities.indexOf($('plot-entity').value);
      if (!state.included.includes(figureState.entity)) throw new Error('Choose an included entity from the list.');
    }
    if (scope === 'custom') {
      figureState.included = [...customEntities].sort((a,b) => a-b);
      if (!figureState.included.length) throw new Error('Choose at least one entity for this figure.');
    }
    return chartData(panel, figureState, {type:$('plot-type').value,scope:scope === 'custom' ? 'included' : scope,
      xVariable:$('plot-x-variable').value,yVariable:$('plot-y-variable').value});
  }
  function entitySuggestions() {
    const {panel,state} = getContext();
    const query = $('plot-entity').value.toLowerCase();
    const names = state.included.map(i => panel.entities[i]).filter(name => name.toLowerCase().includes(query)).slice(0,100);
    $('plot-entity-options').replaceChildren(...names.map(name => new Option(name,name)));
  }
  function entityChecklist() {
    const {panel,state} = getContext();
    const query = $('figure-entity-search').value.toLowerCase();
    const indexes = state.included.filter(i => panel.entities[i].toLowerCase().includes(query));
    entityMatchCount = indexes.length;
    $('figure-entity-list').replaceChildren(...indexes.slice(0,100).map(index => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = String(index); input.checked = customEntities.has(index);
      label.append(input,document.createTextNode(panel.entities[index]));
      return label;
    }));
    updateEntityCount();
  }
  function updateEntityCount() {
    textFields($('figure-entity-count'),[`${customEntities.size} ${t('selectedCount')}`,`${t('showing')} ${Math.min(entityMatchCount,100)} / ${entityMatchCount}`]);
  }
  function contextText(data) {
    const m = data.metadata;
    const range = !m.times.length ? t('cross') : m.times.length === 1 ? m.times[0] : `${m.times[0]}–${m.times.at(-1)}`;
    const unit = m.structure === 'cross-section' ? (m.aggregation === 'none' ? t('entities') : t('aggregation')) : m.aggregation === 'none' ? (getLanguage() === 'zh' ? '个体×时间观测' : 'entity × time observations') : (getLanguage() === 'zh' ? '各时期跨个体聚合值' : 'per-time aggregates across entities');
    return [t(m.aggregation),`${m.entities.length} ${t('entities')}`,range,unit,`n = ${m.plottedCount}/${m.inputCount}`];
  }
  function updateDataControls(resetLabels = true) {
    const {panel, state} = getContext();
    const scatter = $('plot-type').value === 'scatter';
    $('x-variable-control').hidden = !scatter;
    $('swap-axes').hidden = !scatter;
    if (state.aggregation !== 'none') $('plot-scope').value = 'included';
    $('plot-scope').disabled = state.aggregation !== 'none';
    $('plot-type').querySelector('[value="scatter"]').disabled = state.aggregation !== 'none';
    $('plot-type').querySelector('[value="line"]').disabled = panel.kind === 'cross-section';
    $('figure-entity-control').hidden = $('plot-scope').value !== 'selected';
    $('figure-entities-control').hidden = $('plot-scope').value !== 'custom';
    $('figure-period-control').hidden = panel.kind === 'cross-section' || !['bar','scatter'].includes($('plot-type').value) || state.aggregation !== 'none';
    try {
      const data = getData();
      textFields($('figure-context'),contextText(data));
      if (resetLabels) { $('plot-x-label').value = data.xlabel; $('plot-y-label').value = data.ylabel; }
      $('draw-figure').disabled = false;
      status('');
    } catch (error) { $('figure-context').textContent = ''; status(errorText(error)); $('draw-figure').disabled = true; }
    templateInfo();
  }
  function show() {
    const {panel, state} = getContext();
    if (!panel) return;
    clearExports();
    // Plot variables are independent of the reading selection and hidden table columns.
    for (const id of ['plot-x-variable','plot-y-variable']) $(id).replaceChildren(...panel.variables.map(v => new Option(v,v)));
    $('plot-y-variable').value = panel.variables[state.variable];
    $('plot-x-variable').value = panel.variables.find(v => v !== panel.variables[state.variable]) ?? panel.variables[0];
    $('plot-time').replaceChildren(...panel.times.map((value,index) => new Option(timeLabel(panel,value),String(index))));
    $('plot-time').value = String(state.time);
    $('plot-entity').value = panel.entities[state.entity];
    customEntities = new Set([state.entity]); $('figure-entity-search').value = '';
    entitySuggestions(); entityChecklist();
    if (state.aggregation !== 'none' && $('plot-type').value === 'scatter') $('plot-type').value = 'line';
    if (panel.kind === 'cross-section') {
      if ($('plot-type').value === 'line') $('plot-type').value = 'histogram';
      $('plot-scope').value = 'included';
    }
    $('plot-scope').value = $('plot-type').value === 'line' && state.aggregation === 'none' ? 'selected' : 'included';
    $('figure-preview').replaceChildren(document.createTextNode(t('figureEmpty')));
    updateDataControls();
    $('figure-dialog').showModal();
  }
  $('open-figure').addEventListener('click', show);
  $('close-figure').addEventListener('click', () => $('figure-dialog').close());
  $('figure-dialog').addEventListener('cancel', event => { if (rendering) event.preventDefault(); });
  for (const id of ['plot-type','plot-scope','plot-x-variable','plot-y-variable','plot-time']) $(id).addEventListener('change', () => {
    if (id === 'plot-type' && $('plot-type').value !== 'line') $('plot-scope').value = 'included';
    clearExports(); updateDataControls(['plot-type','plot-x-variable','plot-y-variable'].includes(id)); $('figure-preview').style.opacity = '.35';
  });
  $('swap-axes').addEventListener('click', () => {
    const oldX = $('plot-x-variable').value;
    $('plot-x-variable').value = $('plot-y-variable').value; $('plot-y-variable').value = oldX;
    clearExports(); updateDataControls(); $('figure-preview').style.opacity = '.35';
  });
  $('plot-entity').addEventListener('input', () => { entitySuggestions(); clearExports(); updateDataControls(false); $('figure-preview').style.opacity = '.35'; });
  $('figure-entity-search').addEventListener('input',entityChecklist);
  $('figure-entity-list').addEventListener('change', event => {
    const index = Number(event.target.value);
    if (event.target.checked) customEntities.add(index); else customEntities.delete(index);
    updateEntityCount(); clearExports(); updateDataControls(false); $('figure-preview').style.opacity = '.35';
  });
  for (const id of ['plot-template','plot-size','plot-x-label','plot-y-label']) $(id).addEventListener(id.includes('label') ? 'input' : 'change', () => {
    clearExports(); templateInfo(); status(t('outdated')); $('figure-preview').style.opacity = '.35';
  });
  async function requestFigure(spec) {
    if (vscode) return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = setTimeout(() => { pending = null; reject(new Error('Figure request timed out.')); }, 50000);
      pending = {id, resolve, reject, timer};
      vscode.postMessage({type:'renderFigure', id, spec});
    });
    const response = await fetch('/api/figure', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec)});
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || 'Figure rendering failed.');
    return body;
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (data?.type !== 'figureResult' || !pending || data.id !== pending.id) return;
    const current = pending; pending = null; clearTimeout(current.timer);
    if (data.error) current.reject(new Error(data.error)); else current.resolve(data.result);
  });
  $('figure-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (rendering) return;
    rendering = true;
    $('close-figure').disabled = true;
    clearExports();
    const controls = [...$('figure-form').querySelectorAll('input,select,button')];
    const disabledBefore = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    status(t('drawing'));
    try {
      const data = getData();
      const spec = {...data, preset:$('plot-template').value, size:$('plot-size').value,
        xlabel:$('plot-x-label').value.trim(), ylabel:$('plot-y-label').value.trim()};
      result = await requestFigure(spec);
      recipe = {version:1, source:getContext().name, ...spec, rendering:{
        widthMM:result.widthMM,heightMM:result.heightMM,font:result.font,fontPT:result.fontPT,dpi:result.dpi,matplotlib:result.matplotlib,
        templateSource:PRESETS[spec.preset].url, warnings:result.warnings
      }};
      dirty = false;
      const img = document.createElement('img');
      img.alt = `${spec.type}: ${spec.ylabel} / ${spec.xlabel}`;
      img.src = `data:image/svg+xml;base64,${result.files.svg}`;
      $('figure-preview').replaceChildren(img);
      $('figure-preview').style.opacity = '1';
      textFields($('figure-status'),[`${result.widthMM} × ${result.heightMM.toFixed(1)} mm`,`${result.font} ${result.fontPT} pt`,`${result.dpi} dpi PNG`,...result.warnings]);
      document.querySelectorAll('[data-format]').forEach(button => { button.disabled = false; });
    } catch (error) { status(errorText(error)); }
    finally { rendering = false; $('close-figure').disabled = false; controls.forEach((control, i) => { control.disabled = disabledBefore[i]; }); }
  });
  for (const button of document.querySelectorAll('[data-format]')) button.addEventListener('click', () => {
    if (dirty || !result) return;
    const format = button.dataset.format;
    const name = `figure-${recipe.metadata.variable}-${recipe.preset}.${format}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    let bytes;
    if (format === 'json') bytes = new TextEncoder().encode(JSON.stringify(recipe, null, 2));
    else bytes = Uint8Array.from(atob(result.files[format]), char => char.charCodeAt(0));
    if (vscode) {
      if (format === 'json') vscode.postMessage({type:'saveFigure', name, format, text:JSON.stringify(recipe, null, 2)});
      else vscode.postMessage({type:'saveFigure', name, format, base64:result.files[format]});
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], {type:MIME[format]}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return {translate() { translateDOM($('figure-dialog')); templateInfo(); }};
}
