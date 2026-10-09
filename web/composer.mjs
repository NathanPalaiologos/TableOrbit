import { parseFile } from './import.mjs';
import { composeTables } from './compose.mjs';
import { t, errorText, textFields } from './i18n.mjs';
import { MAX_BYTES } from './limits.mjs';

export function setupComposer({openResult}) {
  const $ = id=>document.getElementById(id);
  let left = null, right = null, result = null;
  const loadVersion = {left:0,right:0};
  function invalidate() {
    result = null;
    $('compose-open').disabled = true;
    $('compose-audit').replaceChildren(); $('compose-preview').replaceChildren();
    $('compose-error').textContent = '';
  }
  function keys() {
    return [...$('compose-keys').children].map(row=>({left:row.children[0].value,right:row.children[1].value}));
  }
  function columns() {
    const omitted = new Set(keys().map(pair=>pair.right));
    $('compose-columns').replaceChildren(...(right?.headers ?? []).filter(name=>!omitted.has(name)).map(name=>{
      const label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = name; checkbox.checked = !left?.headers.includes(name);
      label.append(checkbox,document.createTextNode(name)); return label;
    }));
  }
  function addKey() {
    if (!left || !right) return;
    const row = document.createElement('div'); row.className = 'compose-key';
    for (const [table,label] of [[left,'composeLeftKey'],[right,'composeRightKey']]) {
      const select = document.createElement('select'); select.setAttribute('aria-label',t(label));
      const placeholder = new Option(t('chooseColumn'),''); placeholder.disabled = true; placeholder.selected = true;
      select.replaceChildren(placeholder,...table.headers.map(name=>new Option(name,name)));
      select.addEventListener('change',()=>{invalidate(); columns();}); row.append(select);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = t('composeRemoveKey');
    remove.addEventListener('click',()=>{row.remove(); invalidate(); columns();}); row.append(remove);
    $('compose-keys').append(row); invalidate();
  }
  function refresh() {
    invalidate(); $('compose-keys').replaceChildren();
    $('compose-add-key').disabled = !left || !right;
    $('compose-check').disabled = !left || !right;
    addKey(); columns();
  }
  for (const side of ['left','right']) $('compose-'+side+'-file').addEventListener('change',async event=>{
    const file = event.target.files[0]; if (!file) return;
    const version = ++loadVersion[side];
    if (side === 'left') left = null; else right = null;
    $('compose-'+side+'-name').textContent = ''; refresh();
    try {
      if (file.size > MAX_BYTES) throw new Error('composeLimit');
      const table = parseFile(await file.text(),file.name);
      if (version !== loadVersion[side]) return;
      if (side === 'left') left = table; else right = table;
      $('compose-'+side+'-name').textContent = `${file.name} (${table.rows.length})`;
      refresh();
    } catch (error) {
      if (version !== loadVersion[side]) return;
      if (side === 'left') left = null; else right = null;
      $('compose-'+side+'-name').textContent = ''; refresh();
      $('compose-error').textContent = t(error.message) === error.message ? errorText(error) : t(error.message);
    }
    event.target.value = '';
  });
  $('compose-add-key').addEventListener('click',addKey);
  $('compose-operation').addEventListener('change',()=>{
    $('compose-join-fields').hidden = $('compose-operation').value === 'append'; invalidate();
  });
  $('compose-cardinality').addEventListener('change',invalidate);
  $('compose-columns').addEventListener('change',invalidate);
  $('open-compose').addEventListener('click',()=>{$('compose-dialog').showModal();});
  $('compose-close').addEventListener('click',()=>{$('compose-dialog').close();});
  $('compose-check').addEventListener('click',()=>{
    invalidate();
    try {
      result = composeTables(left,right,{operation:$('compose-operation').value,keys:keys(),
        cardinality:$('compose-cardinality').value,columns:[...$('compose-columns').querySelectorAll('input:checked')].map(input=>input.value)});
      const a = result.audit;
      const facts = [`${t('composeLeftRows')}: ${a.leftRows}`,`${t('composeRightRows')}: ${a.rightRows}`,`${t('composeOutputRows')}: ${a.outputRows}`];
      if (a.operation !== 'append') facts.push(`${t('composeMatched')}: ${a.matchedLeft} / ${a.leftRows}`,
        `${t('composeUnmatchedLeft')}: ${a.unmatchedLeft}`,`${t('composeUnmatchedRight')}: ${a.unmatchedRight}`,
        `${t('composeEmptyKeys')}: ${a.missingLeft} / ${a.missingRight}`);
      textFields($('compose-audit'),facts);
      const table = document.createElement('table'), head = table.createTHead().insertRow();
      for (const name of result.table.headers) { const th=document.createElement('th'); th.textContent=name; head.append(th); }
      for (const row of result.table.rows.slice(0,5)) {
        const tr = table.insertRow(); for (const name of result.table.headers) { const td=tr.insertCell(); td.textContent=row[name] || t('missing'); }
      }
      $('compose-preview').replaceChildren(table);
      $('compose-open').disabled = !result.table.rows.length;
    } catch (error) { $('compose-error').textContent = t(error.message) === error.message ? errorText(error) : t(error.message); }
  });
  $('compose-open').addEventListener('click',()=>{
    if (!result) return;
    $('compose-dialog').close(); openResult(JSON.stringify(result.table.rows),'assembled.json');
  });
  return {translate() {
    for (const row of $('compose-keys').children) {
      row.children[0].setAttribute('aria-label',t('composeLeftKey'));
      row.children[1].setAttribute('aria-label',t('composeRightKey'));
      row.children[0].options[0].textContent=t('chooseColumn');
      row.children[1].options[0].textContent=t('chooseColumn');
      row.children[2].textContent=t('composeRemoveKey');
    }
    invalidate();
  }};
}
