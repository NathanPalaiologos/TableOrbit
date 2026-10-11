import {t} from './i18n.mjs';
import {PAGE_ROWS,PAGE_COLUMNS} from './limits.mjs';

export function recordPage(table,row=0,column=0) {
  const rowStart=Math.floor(Math.max(0,Math.min(row,table.rows.length-1))/PAGE_ROWS)*PAGE_ROWS;
  const columnStart=Math.floor(Math.max(0,Math.min(column,table.headers.length-1))/PAGE_COLUMNS)*PAGE_COLUMNS;
  return {rowStart,columnStart,headers:table.headers.slice(columnStart,columnStart+PAGE_COLUMNS),rows:table.rows.slice(rowStart,rowStart+PAGE_ROWS)};
}

export function setupRecords() {
  const $=id=>document.getElementById(id);
  let table=null,position={row:0,column:0};
  function render(){
    if(!table)return;
    const page=recordPage(table,position.row,position.column),grid=document.createElement('table');
    const head=grid.createTHead().insertRow();
    for(const name of page.headers){const th=document.createElement('th');th.textContent=name;head.append(th);}
    const body=grid.createTBody();
    page.rows.forEach((record,r)=>{
      const row=body.insertRow();
      page.headers.forEach((name,c)=>{
        const td=row.insertCell();td.textContent=record[name]??'';
        td.dataset.row=r+page.rowStart;td.dataset.column=c+page.columnStart;
        if(Number(td.dataset.row)===position.row && Number(td.dataset.column)===position.column)td.className='selected';
      });
    });
    $('record-grid').replaceChildren(grid);
    $('record-count').textContent=`${table.rows.length} ${t('records')} / ${table.headers.length} ${t('columns')}`;
    $('record-page').textContent=`${table.rows.length?page.rowStart+1:0}–${Math.min(page.rowStart+PAGE_ROWS,table.rows.length)}`;
    $('record-prev').disabled=page.rowStart===0;$('record-next').disabled=page.rowStart+PAGE_ROWS>=table.rows.length;
    $('record-cols-prev').disabled=page.columnStart===0;$('record-cols-next').disabled=page.columnStart+PAGE_COLUMNS>=table.headers.length;
    $('record-cell').textContent=table.rows[position.row]?.[table.headers[position.column]]??'';
  }
  function move(row,column){position.row=Math.max(0,Math.min(row,table.rows.length-1));position.column=Math.max(0,Math.min(column,table.headers.length-1));render();$('record-grid').querySelector('.selected')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  $('record-grid').addEventListener('click',event=>{const td=event.target.closest('td');if(td){move(Number(td.dataset.row),Number(td.dataset.column));$('record-grid').focus();}});
  $('record-grid').addEventListener('keydown',event=>{
    if(!table || event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    if(event.key==='Enter'){event.preventDefault();$('record-detail').open=!$('record-detail').open;return;}
    if(!event.key.startsWith('Arrow'))return;
    event.preventDefault();move(position.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),position.column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0));
  });
  for(const [id,r,c] of [['record-prev',-PAGE_ROWS,0],['record-next',PAGE_ROWS,0],['record-cols-prev',0,-PAGE_COLUMNS],['record-cols-next',0,PAGE_COLUMNS]])$(id).addEventListener('click',()=>move(position.row+r,position.column+c));
  return {show(next,saved){table=next;position=saved??{row:0,column:0};render();},render};
}
