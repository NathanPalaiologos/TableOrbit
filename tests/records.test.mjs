import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFile,decodeText} from '../web/import.mjs';
import {recordPage} from '../web/records.mjs';

test('record import accepts repeated identifiers, text-only tables and Boolean/nested JSON',()=>{
  const table=parseFile('[{"id":"001","flag":false,"notes":["a","b"]},{"id":"001","flag":true}]','input.json');
  assert.equal(table.rows.length,2);assert.equal(table.rows[0].id,'001');assert.equal(table.rows[0].flag,'false');
  assert.equal(table.rows[0].notes,'["a","b"]');assert.equal(table.rows[1].notes,'');
  assert.deepEqual(parseFile('name,note\na,hello\na,again','text.csv').headers,['name','note']);
  assert.deepEqual(parseFile('[]','empty.json'),{headers:[],rows:[]});
  assert.equal(parseFile('{"flag":false}','record.json').rows[0].flag,'false');
  assert.equal(parseFile('[{"nested":{"number":9007199254740993,"text":"2","list":[false,2]}}]','record.json').rows[0].nested,'{"number":9007199254740993,"text":"2","list":[false,2]}');
});

test('delimiters respect quoted fields; BOM encodings and header-only tables open',()=>{
  for(const delimiter of [',',';','\t','|']){
    const table=parseFile(`id${delimiter}note\n001${delimiter}"a,b;c|d"`,'input.csv');
    assert.deepEqual(table.rows,[{id:'001',note:'a,b;c|d'}]);
  }
  assert.equal(parseFile(decodeText(Buffer.concat([Buffer.from([255,254]),Buffer.from('id\tnote\r\n001\t中文','utf16le')])),'input.tsv').rows[0].note,'中文');
  assert.throws(()=>decodeText(new Uint8Array([0xff,0xfe,0x12])),/encoding/);
  assert.deepEqual(parseFile('id,note\n','empty.csv').rows,[]);
  assert.throws(()=>parseFile('a,b\n1,2,3','bad.csv'),/列数/);
});

test('record pages retain source order and exact text at row and column boundaries',()=>{
  const table={headers:Array.from({length:30},(_,i)=>`c${i}`),rows:Array.from({length:230},(_,i)=>({c0:String(9007199254740993n+BigInt(i))}))};
  const page=recordPage(table,101,25);
  assert.equal(page.rowStart,100);assert.equal(page.columnStart,24);assert.equal(page.rows.length,100);
  assert.equal(page.rows[0].c0,'9007199254741093');assert.equal(page.headers.length,6);
  assert.equal(recordPage(table,229,0).rows.length,30);
  assert.equal(recordPage({headers:['x'],rows:[]}).rows.length,0);
});
