const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const os = require('node:os');

function createScanner(python = process.env.PANEL_SPACE_PYTHON || 'python') {
  const files = new Map();
  let worker = null, active = null, idleTimer = null;
  function stop(reason) {
    clearTimeout(idleTimer);
    const old = worker; worker = null;
    old?.kill();
    if (active) { const job=active; active=null; clearTimeout(job.timer); job.reject(new Error(reason)); }
  }
  function start() {
    if(worker)return;
    const tempRoot=path.resolve(os.tmpdir());
    const temporary=fsSync.mkdtempSync(path.join(tempRoot,'tableorbit-worker-'));
    const child=spawn(python,[path.join(__dirname,'scan_file.py'),'--worker'],{
      windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',TABLEORBIT_WORKER_TEMP:temporary}});
    worker=child;
    let output='';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      if(worker!==child)return;
      output+=chunk;
      if(Buffer.byteLength(output)>12_000_000){stop('File query response is too large.');return;}
      const end=output.indexOf('\n');
      if(end<0)return;
      const line=output.slice(0,end);output=output.slice(end+1);
      const job=active;if(!job)return;
      active=null;clearTimeout(job.timer);
      try{const result=JSON.parse(line);if(result.error)job.reject(new Error(result.error));else job.resolve(result);}
      catch{job.reject(new Error('Invalid worker response.'));stop('Invalid worker response.');}
      idleTimer=setTimeout(()=>stop('Worker idle.'),60_000);idleTimer.unref();
    });
    child.stderr.resume();
    child.on('error',()=>{if(worker===child)stop('Cannot start Python. Configure Python with DuckDB.');});
    child.on('close',()=>{
      if(worker===child)stop('Query worker stopped. Check the configured Python environment.');
      // Only this worker's newly created scratch directory is eligible for cleanup.
      if(path.dirname(path.resolve(temporary))===tempRoot && path.basename(temporary).startsWith('tableorbit-worker-'))
        fs.rm(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
    });
    child.stdin.on('error',()=>{if(worker===child)stop('Query worker input closed.');});
  }
  function run(request) {
    if(active)return Promise.reject(new Error('A file query is running. Wait or cancel it first.'));
    clearTimeout(idleTimer);start();
    return new Promise((resolve,reject)=>{
      active={resolve,reject,timer:setTimeout(()=>stop('File query exceeded 30 seconds. Narrow the selection.'),30_000)};
      worker.stdin.write(JSON.stringify(request)+'\n');
    });
  }
  async function request(input) {
    if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid file request.');
    if(input.action==='cancel'){stop('File query cancelled.');return {cancelled:true};}
    if(input.action==='inspect'){
      if(typeof input.path!=='string' || !path.isAbsolute(input.path))throw new Error('Enter an absolute local Parquet path.');
      const file=await fs.realpath(input.path);
      const metadata=await run({action:'inspect',path:file});
      const {snapshot,...publicMetadata}=metadata;
      const id=crypto.randomUUID();files.set(id,snapshot);
      while(files.size>4)files.delete(files.keys().next().value);
      return {...publicMetadata,id};
    }
    if(!['page','extract','explain','axes','panel','summary','figure-data'].includes(input.action))throw new Error('Unknown file action.');
    const snapshot=files.get(input.id);if(!snapshot)throw new Error('File handle expired. Reopen the file.');
    const {action,columns,filters,timeRange,offset,entity,time,view,period,variable,timeOffset,aggregation,figureEntity,plot}=input;
    return run({action,columns,filters,timeRange,offset,entity,time,view,period,variable,timeOffset,aggregation,figureEntity,plot,snapshot});
  }
  return {request,close(){stop('Reader closed.');files.clear();}};
}
module.exports={createScanner};
