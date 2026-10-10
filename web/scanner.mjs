import {t,errorText,textFields} from './i18n.mjs';

export function scanAnalysisSpec(base,{action,measures,entity,time,view,period,variable,timeOffset,audit=false,aggregation='mean'}) {
  const validate=action==='axes' || action==='panel' || action==='summary' && audit || action==='figure-data' && aggregation==='none';
  return {...base,action,columns:action==='figure-data'?[variable]:measures,entity:validate?entity||null:null,time:time||null,
    view,period,variable,timeOffset};
}

export function setupScanner({vscode,openResult}) {
  const $=id=>document.getElementById(id);
  let source=null,offset=0,busy=false,dirty=false,serial=0,axes=null,timeOffset=0,epoch=0,figure=null,lastPage=null,selectedCell={row:0,col:0};
  const numeric=type=>/^(U?(TINY|SMALL|BIG|HUGE)?INT(EGER)?|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\))$/.test(type);
  const pending=new Map();
  const token=document.querySelector('meta[name="tableorbit-session"]')?.content;
  async function transport(spec,figureRequest=false) {
    if(vscode) return new Promise((resolve,reject)=>{
      const id=++serial; const timer=setTimeout(()=>{pending.delete('lazy-'+id);reject(new Error(t('scanTimeout')));},figureRequest?50000:35000);
      pending.set('lazy-'+id,{resolve,reject,timer});vscode.postMessage({type:figureRequest?'renderFigure':'scan',id:'lazy-'+id,spec});
    });
    const response=await fetch(figureRequest?'/api/figure':'/api/scan',{method:'POST',headers:{'Content-Type':'application/json','X-TableOrbit-Session':token ?? ''},body:JSON.stringify(spec)});
    const data=await response.json(); if(!response.ok || data.error)throw new Error(data.error || t('scanUnavailable')); return data;
  }
  window.addEventListener('message',event=>{
    if(!['scanResult','figureResult'].includes(event.data?.type))return;
    const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);clearTimeout(p.timer);
    if(event.data.error)p.reject(new Error(event.data.error));else p.resolve(event.data.result);
  });
  async function request(spec,figureRequest=false){
    const version=epoch;const result=await transport(spec,figureRequest);
    if(version!==epoch)throw new Error(t('lazyCancelled'));
    return result;
  }
  function controls() {
    for(const id of ['scan-inspect','scan-apply','scan-extract','scan-jump','scan-add-filter']) $(id).disabled=busy || (id!=='scan-inspect' && !source);
    $('scan-cancel').hidden=!busy;
    $('scan-prev').disabled=busy || dirty || !lastPage || offset===0 || $('lazy-view').value==='summary';
    $('scan-next').disabled=busy || dirty || !lastPage?.hasMore;
    $('lazy-time-prev').disabled=busy || dirty || !lastPage || timeOffset===0;
    $('lazy-time-next').disabled=busy || dirty || !lastPage?.timeHasMore;
    $('lazy-controls').disabled=busy || !source;
    $('lazy-draw').disabled=busy || dirty || !source;
    $('scan-extract').disabled=busy || dirty || !source;
    $('scan-jump').disabled=$('scan-offset').disabled=busy || dirty || !source;
    $('scan-pending').hidden=!dirty;
    $('scan-records').disabled=busy;
    $('lazy-audit-label').hidden=$('lazy-view').value!=='summary';
    $('scan-view-hint').textContent=t($('lazy-view').value==='raw'?'scanRecordHint':$('lazy-view').value==='summary'?'scanSummaryHint':'scanPanelHint');
    $('scan-close').disabled=false;
    $('scan-extract').hidden=$('scan-extract-note').hidden=$('lazy-view').value!=='raw';
    $('lazy-layer').disabled=busy || !['cross','series'].includes($('lazy-view').value);
    $('lazy-figure').querySelectorAll('input,select').forEach(el=>{el.disabled=busy || !source;});
    $('lazy-figure-entity').disabled=busy || !source || $('lazy-aggregation').value!=='none';
    $('scan-path').disabled=busy;
    $('scan-options').disabled=busy || !source;
  }
  async function run(action) {
    if(busy)return;busy=true;controls();$('scan-error').textContent='';$('scan-prev').disabled=true;$('scan-next').disabled=true;
    const previousOffset=offset,previousTimeOffset=timeOffset;
    try {await action();}catch(error){offset=previousOffset;timeOffset=previousTimeOffset;$('scan-error').textContent=errorText(error);$('scan-records').hidden=!source || $('lazy-view').value==='raw';}
    finally {busy=false;controls();}
  }
  function filters() {
    return [...$('scan-filters').children].map(row=>({column:row.children[0].value,op:row.children[1].value,value:row.children[2].value})).filter(item=>item.column);
  }
  function spec(action) {
    return {action,id:source.id,offset,columns:[...$('scan-columns').querySelectorAll('input:checked')].map(input=>input.value),filters:filters(),
      timeRange:$('scan-time-column').value ? {column:$('scan-time-column').value,start:$('scan-time-start').value,end:$('scan-time-end').value} : null};
  }
  function clearPage() {
    lastPage=null;
    $('scan-table').replaceChildren();$('scan-page-info').textContent='';$('scan-prev').disabled=true;$('scan-next').disabled=true;
    $('scan-cell-coordinate').textContent='';$('scan-cell-value').textContent='';
  }
  function columnList(){
    const search=$('scan-column-search').value.trim().toLowerCase();
    const inputs=[...$('scan-columns').querySelectorAll('input')];
    const count=inputs.filter(input=>input.checked).length;
    for(const input of inputs){input.parentElement.hidden=!input.value.toLowerCase().includes(search);input.disabled=!input.checked && count>=24;}
    $('scan-column-count').textContent=`${count} / 24`;
  }
  function addFilter() {
    if(!source || $('scan-filters').children.length>=8)return;
    const row=document.createElement('div');row.className='scan-filter';
    const column=document.createElement('select');column.setAttribute('aria-label',t('scanFilterColumn'));
    column.replaceChildren(new Option(t('chooseColumn'),''),...source.columns.map(c=>new Option(c.name,c.name)));
    const op=document.createElement('select');op.setAttribute('aria-label',t('scanOperator'));
    op.replaceChildren(...[['eq','='],['ne','≠'],['lt','<'],['le','≤'],['gt','>'],['ge','≥'],['null','IS NULL'],['notnull','IS NOT NULL']].map(([value,label])=>new Option(label,value)));
    const value=document.createElement('input');value.type='text';value.setAttribute('aria-label',t('scanFilterValue'));
    op.addEventListener('change',()=>{value.disabled=['null','notnull'].includes(op.value);});
    const remove=document.createElement('button');remove.type='button';remove.textContent=t('scanRemove');remove.addEventListener('click',()=>{row.remove();invalidate();});
    row.append(column,op,value,remove);$('scan-filters').append(row);
  }
  function selectedMeasures(){
    const selected=spec('page').columns;
    return source.columns.filter(c=>selected.includes(c.name) && numeric(c.type) && ![$('lazy-entity').value,$('lazy-time').value].includes(c.name)).map(c=>c.name);
  }
  function analysisSpec(action){
    return scanAnalysisSpec(spec(action),{action,measures:selectedMeasures(),entity:$('lazy-entity').value,time:$('lazy-time').value,
      view:$('lazy-view').value,period:$('lazy-layer').value,variable:action==='panel' && $('lazy-view').value==='series'?$('lazy-layer').value:$('lazy-y').value,
      timeOffset,audit:$('lazy-audit').checked,aggregation:$('lazy-aggregation').value});
  }
  function measureChoices(){
    if(!source)return;
    const value=$('lazy-y').value;
    const measures=source.columns.filter(c=>numeric(c.type) && ![$('lazy-entity').value,$('lazy-time').value].includes(c.name)).map(c=>c.name);
    $('lazy-y').replaceChildren(...measures.map(c=>new Option(c,c)));
    if(measures.includes(value))$('lazy-y').value=value;
  }
  function invalidate(){
    dirty=true;axes=null;timeOffset=0;offset=0;clearFigure();measureChoices();
    $('lazy-layer').replaceChildren();$('lazy-scope').textContent='';
    $('scan-records').hidden=true;$('scan-error').textContent='';columnList();controls();
  }
  function clearFigure(){
    figure=null;$('lazy-preview').replaceChildren();
    for(const id of ['lazy-export','lazy-svg','lazy-pdf','lazy-png'])$(id).disabled=true;
  }
  async function page() {
    const view=$('lazy-view').value;
    let query,data;
    if(view==='raw'){query=spec('page');data=await request(query);}
    else{
      if(['cross','series'].includes(view) && !axes){
        axes=await request(analysisSpec('axes'));
        $('lazy-layer').replaceChildren(...(view==='cross'?axes.times:selectedMeasures()).map(c=>new Option(c,c)));
      }
      query=analysisSpec(view==='summary'?'summary':'panel');
      data=await request(query);
    }
    lastPage=data;dirty=false;$('scan-records').hidden=true;
    const table=document.createElement('table'),head=table.createTHead().insertRow();
    for(const name of data.columns){const th=document.createElement('th');th.textContent=view==='summary'?t(name==='variable'?'variables':name):name;head.append(th);}
    data.rows.forEach((record,index)=>{
      const row=table.insertRow();
      data.columns.forEach((name,col)=>{
        const td=row.insertCell();const value=Array.isArray(record)?record[col]:record[name];
        td.textContent=view==='summary' && name==='absent' && value===null?t('lazyNoKeyAudit'):data.present && col>0 && !data.present[index][col-1]?t('absent'):value===null?t('missing'):String(value);
      });
    });
    $('scan-cell-coordinate').textContent='';$('scan-cell-value').textContent='';
    $('scan-table').replaceChildren(table);selectCell(selectedCell.row,selectedCell.col,false);
    const scoped=view==='summary'?t('lazyAll'):view==='raw'?t(query.filters.length || query.timeRange?.start || query.timeRange?.end?'scanFiltered':'scanFileOrder'):t('entities');
    textFields($('scan-page-info'),[`${offset+(data.rows.length?1:0)}–${offset+data.rows.length}`,scoped]);
    $('scan-offset').value=String(offset+1);$('scan-prev').disabled=offset===0||view==='summary';$('scan-next').disabled=!data.hasMore;
    $('scan-jump').hidden=view==='summary';$('scan-offset').parentElement.hidden=view==='summary';
    $('lazy-time-prev').hidden=$('lazy-time-next').hidden=view!=='series';
    $('lazy-time-prev').disabled=timeOffset===0;$('lazy-time-next').disabled=!data.timeHasMore;
    textFields($('lazy-scope'),[view==='raw'?'':t('lazyAll'),...(data.keyAudit?[`${data.keyAudit.records} ${t('records')}`,`${data.keyAudit.entities} ${t('entities')}`]:[]),`${data.metrics.queryMs.toFixed(1)} ms`]);
  }
  function inspect(filePath) {
    if(filePath)$('scan-path').value=filePath;
    if(!$('scan-dialog').open)$('scan-dialog').showModal();
    return run(async()=>{
      source=null;axes=null;dirty=false;selectedCell={row:0,col:0};clearFigure();$('lazy-scope').textContent='';clearPage();$('scan-meta').textContent='';$('scan-columns').replaceChildren();$('scan-filters').replaceChildren();$('scan-column-search').value='';$('scan-records').hidden=true;$('lazy-audit').checked=false;
      source=await request({action:'inspect',path:$('scan-path').value});offset=0;
      metadata();
      $('lazy-view').value='raw';axes=null;timeOffset=0;
      for(const id of ['lazy-entity','lazy-time'])$(id).replaceChildren(new Option(t('chooseColumn'),''),...source.columns.map(c=>new Option(c.name,c.name)));
      $('lazy-layer').replaceChildren();
      $('scan-time-column').replaceChildren(new Option(t('chooseColumn'),''),...source.columns.map(c=>new Option(`${c.name} (${c.type})`,c.name)));
      $('scan-time-start').value='';$('scan-time-end').value='';
      $('scan-columns').replaceChildren(...source.columns.map((c,index)=>{
        const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c.name;input.checked=index<8;
        label.append(input,document.createTextNode(`${c.name} (${c.type})`));return label;
      }));
      columnList();measureChoices();await page();
    });
  }
  $('open-scan').addEventListener('click',()=>{$('scan-dialog').showModal();controls();});
  $('scan-inspect').addEventListener('click',()=>inspect());
  $('scan-path').addEventListener('input',()=>{source=null;axes=null;dirty=false;clearFigure();$('lazy-scope').textContent='';clearPage();$('scan-meta').textContent='';$('scan-records').hidden=true;controls();});
  $('scan-cancel').addEventListener('click',()=>{epoch++;request({action:'cancel'}).catch(error=>{$('scan-error').textContent=errorText(error);});});
  $('scan-close').addEventListener('click',()=>{$('scan-dialog').close();});
  $('scan-dialog').addEventListener('close',()=>{epoch++;if(busy)request({action:'cancel'}).catch(()=>{});});
  $('scan-options').addEventListener('change',event=>{if(event.target.id!=='scan-column-search')invalidate();});
  $('scan-options').addEventListener('input',event=>{if(event.target.matches('input:not([type=checkbox]):not([type=search])'))invalidate();});
  $('scan-column-search').addEventListener('input',columnList);
  $('scan-clear-columns').addEventListener('click',()=>{$('scan-columns').querySelectorAll('input').forEach(input=>{input.checked=false;});invalidate();});
  $('scan-numeric').addEventListener('click',()=>{
    const measures=source.columns.filter(c=>numeric(c.type) && ![$('lazy-entity').value,$('lazy-time').value].includes(c.name)).slice(0,24).map(c=>c.name);
    $('scan-columns').querySelectorAll('input').forEach(input=>{input.checked=measures.includes(input.value);});invalidate();
  });
  $('lazy-controls').addEventListener('change',event=>{
    if(event.target.id==='lazy-layer'){clearFigure();run(page);}
    else {invalidate();if(event.target.id==='lazy-view' && ['raw','summary'].includes($('lazy-view').value))run(page);}
    controls();
  });
  $('scan-records').addEventListener('click',()=>{$('lazy-view').value='raw';invalidate();run(page);});
  $('scan-add-filter').addEventListener('click',addFilter);
  $('scan-apply').addEventListener('click',()=>run(async()=>{offset=0;await page();}));
  $('scan-prev').addEventListener('click',()=>run(async()=>{offset=Math.max(0,offset-100);await page();}));
  $('scan-next').addEventListener('click',()=>run(async()=>{offset+=100;await page();}));
  $('scan-jump').addEventListener('click',()=>run(async()=>{
    const row=Number($('scan-offset').value);if(!Number.isSafeInteger(row)||row<1)throw new Error(t('scanInvalidRow'));offset=row-1;await page();
  }));
  $('scan-extract').addEventListener('click',()=>run(async()=>{
    const result=await request(spec('extract'));if(!result.rows.length)throw new Error(t('scanEmpty'));
    $('scan-dialog').close();openResult(JSON.stringify(result.rows),`${source.name}.selection.json`);
  }));
  for(const [id,step] of [['lazy-time-prev',-24],['lazy-time-next',24]])$(id).addEventListener('click',()=>run(async()=>{timeOffset=Math.max(0,timeOffset+step);await page();}));
  function selectCell(row,col,reveal=true){
    const rows=$('scan-table').querySelectorAll('tr');
    if(rows.length<2)return;
    const r=Math.max(0,Math.min(row,rows.length-2));const cells=rows[r+1].querySelectorAll('td');
    const c=Math.max(0,Math.min(col,cells.length-1));selectedCell={row:r,col:c};
    $('scan-table').querySelectorAll('.selected').forEach(td=>td.classList.remove('selected'));
    cells[c]?.classList.add('selected');if(reveal)cells[c]?.scrollIntoView({block:'nearest',inline:'nearest'});
    if($('scan-cell').open)cellValue();
  }
  function cellValue(){
    if(!lastPage)return;
    const record=lastPage.rows[selectedCell.row],name=lastPage.columns[selectedCell.col];
    if(!record || !name)return;
    const value=Array.isArray(record)?record[selectedCell.col]:record[name];
    const shown=$('scan-table').querySelector('td.selected')?.textContent ?? '';
    const text=value===null?shown:String(value);
    $('scan-cell-coordinate').textContent=`${name} / ${selectedCell.row+1}`;
    $('scan-cell-value').textContent=text.slice(0,20000)+(text.length>20000?'\n'+t('scanCellLimit'):'');
  }
  $('scan-cell').addEventListener('toggle',()=>{if($('scan-cell').open)cellValue();});
  $('scan-table').addEventListener('click',event=>{
    const td=event.target.closest('td');if(!td)return;
    selectCell(td.parentElement.rowIndex-1,td.cellIndex);$('scan-table').focus({preventScroll:true});
  });
  $('scan-table').addEventListener('keydown',event=>{
    if(event.key==='Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing){event.preventDefault();$('scan-cell').open=!$('scan-cell').open;return;}
    if(event.ctrlKey || event.metaKey || event.altKey || event.isComposing || !event.key.startsWith('Arrow'))return;
    if(busy || dirty){event.preventDefault();return;}
    if(event.shiftKey || ['raw','summary'].includes($('lazy-view').value)){event.preventDefault();selectCell(selectedCell.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),selectedCell.col+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0));return;}
    if(!axes)return;
    if(event.repeat){event.preventDefault();return;}
    const view=$('lazy-view').value;if(!['cross','series'].includes(view)||!event.key.startsWith('Arrow'))return;
    event.preventDefault();
    if(['ArrowLeft','ArrowRight'].includes(event.key)){
      const measures=selectedMeasures(),period=view==='cross'?$('lazy-layer').value:axes.times[timeOffset+Math.max(0,selectedCell.col-1)];
      const variable=view==='series'?$('lazy-layer').value:measures[Math.max(0,selectedCell.col-1)];
      $('lazy-view').value=view==='cross'?'series':'cross';
      $('lazy-layer').replaceChildren(...(view==='cross'?measures:axes.times).map(c=>new Option(c,c)));
      $('lazy-layer').value=view==='cross'?variable:period;
      timeOffset=Math.floor(axes.times.indexOf(period)/24)*24;
      selectedCell.col=view==='cross'?axes.times.indexOf(period)%24+1:measures.indexOf(variable)+1;
      clearFigure();run(page);
    }
    else {const layer=$('lazy-layer');const next=layer.selectedIndex+(event.key==='ArrowDown'?1:-1);if(next>=0 && next<layer.options.length){layer.selectedIndex=next;clearFigure();run(page);}}
  });
  $('lazy-figure').addEventListener('change',()=>{clearFigure();controls();});
  for(const id of ['lazy-xlabel','lazy-ylabel','lazy-figure-entity'])$(id).addEventListener('input',clearFigure);
  $('lazy-draw').addEventListener('click',()=>run(async()=>{
    clearFigure();
    const data=await request({...analysisSpec('figure-data'),plot:$('lazy-plot').value,aggregation:$('lazy-aggregation').value,figureEntity:$('lazy-figure-entity').value});
    const recipe={...data,xlabel:$('lazy-xlabel').value.trim()||data.xlabel,ylabel:$('lazy-ylabel').value.trim()||data.ylabel,preset:$('lazy-preset').value,size:$('lazy-size').value,source:source.name};
    const rendering=await request(recipe,true);figure={recipe,rendering};
    const img=document.createElement('img');img.addEventListener('load',()=>img.scrollIntoView({block:'nearest',inline:'nearest'}),{once:true});img.alt=data.ylabel;img.src='data:image/svg+xml;base64,'+rendering.files.svg;$('lazy-preview').replaceChildren(img);
    for(const id of ['lazy-export','lazy-svg','lazy-pdf','lazy-png'])$(id).disabled=false;
    textFields($('lazy-scope'),[t('lazyAll'),`N = ${data.metadata.inputCount}`,...rendering.warnings]);
  }));
  for(const [id,format] of [['lazy-export','json'],['lazy-svg','svg'],['lazy-pdf','pdf'],['lazy-png','png']])$(id).addEventListener('click',()=>{
    if(!figure)return;
    const name='tableorbit-figure.'+format;
    const text=format==='json'?JSON.stringify(figure.recipe,null,2):null;
    const base64=format==='json'?null:figure.rendering.files[format];
    if(vscode){vscode.postMessage({type:'saveFigure',name,format,text,base64});return;}
    const content=text??Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([content]));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const initial=document.querySelector('meta[name="tableorbit-file"]')?.content;
  function metadata(){
    const size=source.bytes<1e6?`${(source.bytes/1e3).toFixed(1)} kB`:`${(source.bytes/1e6).toFixed(1)} MB`;
    textFields($('scan-meta'),[source.name,`${source.rows} ${t('records')}`,`${t('scanFiles')}: ${source.fileCount}`,size,source.engine]);
  }
  function translate() {
    if(source)metadata();
    if($('scan-time-column').options.length)$('scan-time-column').options[0].textContent=t('chooseColumn');
    for(const id of ['lazy-entity','lazy-time'])if($(id).options.length)$(id).options[0].textContent=t('chooseColumn');
    for(const row of $('scan-filters').children){
      row.children[0].setAttribute('aria-label',t('scanFilterColumn'));
      row.children[0].options[0].textContent=t('chooseColumn');
      row.children[1].setAttribute('aria-label',t('scanOperator'));
      row.children[2].setAttribute('aria-label',t('scanFilterValue'));
      row.children[3].textContent=t('scanRemove');
    }
    // A new page will use the new language, without making an implicit disk query.
    clearPage();
    controls();
  }
  return {inspect,initial,translate};
}
