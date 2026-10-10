const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Explorer commands and readonly Parquet editor share the reader and close its scanner',async()=>{
  const root=path.resolve(__dirname,'..');
  const commands=new Map();let editor,closed=false;
  const uri={scheme:'file',fsPath:path.join(root,'sample.parquet')};
  const panel={webview:{asWebviewUri:()=>({toString:()=> 'test://web'}),cspSource:'test:',onDidReceiveMessage(){},postMessage(){}},onDidDispose(fn){this.dispose=fn;}};
  const api={Uri:{file:p=>({fsPath:p,scheme:'file'})},FileType:{Directory:2},ViewColumn:{One:1},
    workspace:{getConfiguration:()=>({get:()=>''}),fs:{stat:async()=>({type:1,size:100})}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return {dispose(){}};}},
    window:{createWebviewPanel:()=>panel,registerCustomEditorProvider:(id,provider)=>{editor=provider;assert.equal(id,'tableorbit.data');return {dispose(){}};}}};
  const module={exports:{}};
  const load=name=>name==='vscode'?api:name==='./scripts/scan.cjs'?{createScanner:()=>({close(){closed=true;},request(){}})}:name==='./scripts/figure.cjs'?{renderFigure(){}}:require(name);
  vm.runInNewContext(fs.readFileSync(path.join(root,'extension.cjs'),'utf8'),{require:load,module,process,Buffer});
  module.exports.activate({extensionPath:root,subscriptions:[]});
  const document=await editor.openCustomDocument(uri);
  await editor.resolveCustomEditor(document,panel);
  assert.match(panel.webview.html,/sample.parquet/);
  assert.equal(panel.webview.options.enableScripts,true);
  assert(commands.has('panelSpace.openCsv'));
  assert(commands.has('panelSpace.openParquetFolder'));
  assert(commands.has('panelSpace.agentCLI'));
  panel.dispose();assert(closed);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  assert.equal(manifest.contributes.customEditors[0].priority,'default');
  assert(manifest.files.includes('scripts/tableorbit.mjs'));
});
