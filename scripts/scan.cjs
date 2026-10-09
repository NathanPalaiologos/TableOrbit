const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createScanner(python = process.env.PANEL_SPACE_PYTHON || 'python') {
  const files = new Map();
  let active = null;
  function run(request) {
    if (active) return Promise.reject(new Error('A file query is running. Wait or cancel it first.'));
    return new Promise((resolve,reject)=>{
      const child=spawn(python,[path.join(__dirname,'scan_file.py')],{windowsHide:true,
        stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
      active=child; let output='', errors='', settled=false;
      const finish=(error,result)=>{
        if (settled) return; settled=true; clearTimeout(timer); active=null;
        if (error) reject(error); else resolve(result);
      };
      child.cancel=()=>{child.kill(); finish(new Error('File query cancelled.'));};
      const timer=setTimeout(()=>{child.kill(); finish(new Error('File query exceeded 30 seconds. Narrow the filters or retry.'));},30000);
      child.on('error',()=>finish(new Error('Cannot start Python. Configure a Python environment with DuckDB.')));
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data',chunk=>{output+=chunk; if(Buffer.byteLength(output)>12_000_000){child.kill();finish(new Error('File query response is too large.'));}});
      child.stderr.on('data',chunk=>{if(errors.length<2000)errors+=chunk;});
      child.on('close',code=>{
        if(settled)return;
        try {const result=JSON.parse(output); finish(code || result.error ? new Error(result.error || 'File query failed.') : null,result);}
        catch {finish(new Error(errors.includes('duckdb') ? 'DuckDB is unavailable in the configured Python environment.' : 'File query failed.'));}
      });
      child.stdin.on('error',()=>{}); child.stdin.end(JSON.stringify(request));
    });
  }
  async function request(input) {
    if(!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid file request.');
    if (input.action === 'cancel') {active?.cancel(); return {cancelled:true};}
    if (input.action === 'inspect') {
      if(typeof input.path !== 'string' || !path.isAbsolute(input.path)) throw new Error('Enter an absolute local Parquet path.');
      const file=await fs.realpath(input.path), stat=await fs.stat(file);
      if(!stat.isFile() || path.extname(file).toLowerCase()!=='.parquet') throw new Error('Choose a local .parquet file.');
      const metadata=await run({action:'inspect',path:file});
      const id=crypto.randomUUID(); files.set(id,{path:file,size:stat.size,modified:stat.mtimeMs});
      while(files.size>4)files.delete(files.keys().next().value);
      return {...metadata,id};
    }
    if(!['page','extract','explain'].includes(input.action))throw new Error('Unknown file action.');
    const file=files.get(input.id); if(!file)throw new Error('File handle expired. Reopen the file.');
    const stat=await fs.stat(file.path);
    if(stat.size!==file.size || stat.mtimeMs!==file.modified)throw new Error('File changed. Reopen it.');
    return run({...input,path:file.path});
  }
  return {request,close(){active?.cancel();files.clear();}};
}
module.exports={createScanner};
