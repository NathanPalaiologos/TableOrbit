const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { renderFigure } = require('./scripts/figure.cjs');
const { createScanner } = require('./scripts/scan.cjs');

function activate(context) {
  const root = path.join(context.extensionPath, 'web');
  async function readCsv(uri) {
    if(uri.scheme!=='file')throw new Error('TableOrbit needs a filesystem path on the extension host.');
    if((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory)return {parquet:uri.fsPath};
    if(path.extname(uri.fsPath).toLowerCase()==='.parquet') return {parquet:uri.fsPath};
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > 10_000_000) throw new Error('Text imports are limited to 10 MB. Use Scan Parquet for a larger Parquet source.');
    return {text:Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),name:path.basename(uri.fsPath)};
  }
  async function chooseCsv() {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Data: ['parquet', 'csv', 'tsv', 'json', 'jsonl', 'ndjson'] } });
    if (!files?.length) return null;
    return readCsv(files[0]);
  }
  async function open(initial, existingPanel) {
    const scanner=createScanner(vscode.workspace.getConfiguration('panelSpace').get('pythonPath') || process.env.PANEL_SPACE_PYTHON || 'python');
    const panel = existingPanel || vscode.window.createWebviewPanel('panelSpace', 'TableOrbit', vscode.ViewColumn.One, {
      enableScripts: true, localResourceRoots: [vscode.Uri.file(root)], retainContextWhenHidden: true
    });
    panel.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.file(root)]};
    const nonce = crypto.randomBytes(18).toString('base64');
    const base = panel.webview.asWebviewUri(vscode.Uri.file(root)).toString() + '/';
    panel.onDidDispose(()=>scanner.close());
    const boot = JSON.stringify({ demo: fs.readFileSync(path.join(root,'data','grunfeld.csv'),'utf8'), csv: initial?.text, name: initial?.name,parquet:initial?.parquet }).replace(/</g,'\\u003c');
    let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    html = html.replace('<head>', `<head><base href="${base}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; connect-src ${panel.webview.cspSource};">`);
    html = html.replace('<script type="module"', `<script nonce="${nonce}">window.__PANEL_BOOT__=${boot};</script><script nonce="${nonce}" type="module"`);
    panel.webview.html = html;
    panel.webview.onDidReceiveMessage(async message => {
      try {
        if(message?.type === 'openCsv') { const csv=await chooseCsv(); if(csv) panel.webview.postMessage(csv.parquet ? {type:'parquet',path:csv.parquet} : {type:'csv',...csv}); }
        if(message?.type === 'scan') {
          try {const result=await scanner.request(message.spec);panel.webview.postMessage({type:'scanResult',id:message.id,result});}
          catch(error){panel.webview.postMessage({type:'scanResult',id:message.id,error:error.message});}
        }
        if(message?.type === 'renderFigure') {
          try {
            const python = vscode.workspace.getConfiguration('panelSpace').get('pythonPath') || process.env.PANEL_SPACE_PYTHON || 'python';
            const result = await renderFigure(message.spec, python);
            panel.webview.postMessage({type:'figureResult',id:message.id,result});
          } catch(error) { panel.webview.postMessage({type:'figureResult',id:message.id,error:error.message}); }
        }
        if(message?.type === 'saveFigure' && ['pdf','png','svg','json'].includes(message.format)) {
          const encoded = message.format === 'json' ? message.text : message.base64;
          if(typeof encoded !== 'string' || encoded.length > 12_000_000) throw new Error('Invalid figure export.');
          const name=String(message.name??'figure').replace(/[^a-zA-Z0-9_.-]/g,'_');
          const uri=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(context.extensionPath,name)),filters:{Figure:[message.format]}});
          if(uri) await vscode.workspace.fs.writeFile(uri,Buffer.from(encoded,message.format === 'json' ? 'utf8' : 'base64'));
        }
        if(message?.type === 'export' && typeof message.text === 'string' && message.text.length <= 20_000_000) {
          const name=String(message.name??'panel-space.csv').replace(/[^a-zA-Z0-9_.-]/g,'_');
          const uri=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(context.extensionPath,name)),filters:{CSV:['csv']}});
          if(uri){await vscode.workspace.fs.writeFile(uri,Buffer.from(message.text,'utf8'));panel.webview.postMessage({type:'exported'});}
        }
      } catch(error){vscode.window.showErrorMessage(error.message);}
    },undefined,context.subscriptions);
  }
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('tableorbit.data', {
    async openCustomDocument(uri) { return {uri,dispose(){}}; },
    async resolveCustomEditor(document,panel) { await open(await readCsv(document.uri),panel); }
  },{webviewOptions:{retainContextWhenHidden:true},supportsMultipleEditorsPerDocument:false}));
  context.subscriptions.push(vscode.commands.registerCommand('panelSpace.agentCLI',()=>{
    const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
    const output=vscode.window.createOutputChannel('TableOrbit CLI');context.subscriptions.push(output);
    output.appendLine('Run the command below in Bash, or pass its executable and arguments to your agent. Node.js must be on PATH.');
    const python=vscode.workspace.getConfiguration('panelSpace').get('pythonPath') || process.env.PANEL_SPACE_PYTHON;
    output.appendLine((python?'PANEL_SPACE_PYTHON='+quote(python)+' ':'')+'node '+quote(path.join(context.extensionPath,'scripts','tableorbit.mjs'))+' agent');
    output.appendLine('Then send one JSON request per line. This request lists the available actions:');
    output.appendLine(JSON.stringify({requestId:1,spec:{action:'capabilities'}}));
    output.show();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('panelSpace.openDemo' ,()=>open()));
  context.subscriptions.push(vscode.commands.registerCommand('panelSpace.openParquetFolder',async uri=>{
    try {
      if(!uri){const folders=await vscode.window.showOpenDialog({canSelectMany:false,canSelectFiles:false,canSelectFolders:true});uri=folders?.[0];}
      if(uri)await open(await readCsv(uri));
    }catch(error){vscode.window.showErrorMessage(error.message);}
  }));
  context.subscriptions.push(vscode.commands.registerCommand('panelSpace.openCsv',async uri=>{
    try {const csv=uri?await readCsv(uri):await chooseCsv();if(csv)await open(csv);}
    catch(error){vscode.window.showErrorMessage(error.message);}
  }));
}
module.exports = { activate };
