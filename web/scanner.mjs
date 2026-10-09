import {t,errorText,textFields} from './i18n.mjs';

export function setupScanner({vscode,openResult}) {
  const $=id=>document.getElementById(id);
  let source=null,offset=0,busy=false,serial=0;
  const pending=new Map();
  const token=document.querySelector('meta[name="tableorbit-session"]')?.content;
  async function request(spec) {
    if(vscode) return new Promise((resolve,reject)=>{
      const id=++serial; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(t('scanTimeout')));},35000);
      pending.set(id,{resolve,reject,timer});vscode.postMessage({type:'scan',id,spec});
    });
    const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json','X-TableOrbit-Session':token ?? ''},body:JSON.stringify(spec)});
    const data=await response.json(); if(!response.ok || data.error)throw new Error(data.error || t('scanUnavailable')); return data;
  }
  window.addEventListener('message',event=>{
    if(event.data?.type!=='scanResult')return;
    const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);clearTimeout(p.timer);
    if(event.data.error)p.reject(new Error(event.data.error));else p.resolve(event.data.result);
  });
  function controls() {
    for(const id of ['scan-inspect','scan-apply','scan-extract','scan-jump','scan-add-filter']) $(id).disabled=busy || (id!=='scan-inspect' && !source);
    $('scan-cancel').hidden=!busy;
    $('scan-path').disabled=busy;
    $('scan-options').disabled=busy || !source;
  }
  async function run(action) {
    if(busy)return;busy=true;controls();$('scan-error').textContent='';$('scan-prev').disabled=true;$('scan-next').disabled=true;
    try {await action();}catch(error){$('scan-error').textContent=errorText(error);}
    finally {busy=false;controls();}
  }
  function filters() {
    return [...$('scan-filters').children].map(row=>({column:row.children[0].value,op:row.children[1].value,value:row.children[2].value})).filter(item=>item.column);
  }
  function spec(action) {
    return {action,id:source.id,offset,columns:[...$('scan-columns').querySelectorAll('input:checked')].map(input=>input.value),filters:filters()};
  }
  function clearPage() {
    $('scan-table').replaceChildren();$('scan-page-info').textContent='';$('scan-prev').disabled=true;$('scan-next').disabled=true;
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
    const remove=document.createElement('button');remove.type='button';remove.textContent=t('scanRemove');remove.addEventListener('click',()=>{row.remove();clearPage();});
    row.append(column,op,value,remove);$('scan-filters').append(row);
  }
  async function page() {
    clearPage();
    const query=spec('page'),data=await request(query);
    const table=document.createElement('table'),head=table.createTHead().insertRow();
    for(const name of data.columns){const th=document.createElement('th');th.textContent=name;head.append(th);}
    for(const record of data.rows){const row=table.insertRow();for(const name of data.columns){const td=row.insertCell();td.textContent=record[name]===null?t('missing'):record[name];}}
    $('scan-table').replaceChildren(table);
    textFields($('scan-page-info'),[`${offset+ (data.rows.length ? 1:0)}–${offset+data.rows.length}`,t(query.filters.length?'scanFiltered':'scanFileOrder')]);
    $('scan-offset').value=String(offset+1);$('scan-prev').disabled=offset===0;$('scan-next').disabled=!data.hasMore;
  }
  function inspect(filePath) {
    if(filePath)$('scan-path').value=filePath;
    if(!$('scan-dialog').open)$('scan-dialog').showModal();
    return run(async()=>{
      source=null;clearPage();$('scan-meta').textContent='';$('scan-columns').replaceChildren();$('scan-filters').replaceChildren();
      source=await request({action:'inspect',path:$('scan-path').value});offset=0;
      textFields($('scan-meta'),[source.name,`${source.rows} ${t('records')}`,`${(source.bytes/1e6).toFixed(1)} MB`,source.engine]);
      $('scan-columns').replaceChildren(...source.columns.map((c,index)=>{
        const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c.name;input.checked=index<8;
        label.append(input,document.createTextNode(`${c.name} (${c.type})`));return label;
      }));
      await page();
    });
  }
  $('open-scan').addEventListener('click',()=>{$('scan-dialog').showModal();controls();});
  $('scan-inspect').addEventListener('click',()=>inspect());
  $('scan-path').addEventListener('input',()=>{source=null;clearPage();$('scan-meta').textContent='';controls();});
  $('scan-cancel').addEventListener('click',()=>{request({action:'cancel'}).catch(error=>{$('scan-error').textContent=errorText(error);});});
  $('scan-close').addEventListener('click',()=>{$('scan-dialog').close();});
  $('scan-dialog').addEventListener('close',()=>{if(busy)request({action:'cancel'}).catch(()=>{});});
  $('scan-options').addEventListener('change',clearPage);
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
  const initial=document.querySelector('meta[name="tableorbit-file"]')?.content;
  function translate() {
    if(source)textFields($('scan-meta'),[source.name,`${source.rows} ${t('records')}`,`${(source.bytes/1e6).toFixed(1)} MB`,source.engine]);
    for(const row of $('scan-filters').children){
      row.children[0].setAttribute('aria-label',t('scanFilterColumn'));
      row.children[0].options[0].textContent=t('chooseColumn');
      row.children[1].setAttribute('aria-label',t('scanOperator'));
      row.children[2].setAttribute('aria-label',t('scanFilterValue'));
      row.children[3].textContent=t('scanRemove');
    }
    // A new page will use the new language, without making an implicit disk query.
    clearPage();
  }
  return {inspect,initial,translate};
}
