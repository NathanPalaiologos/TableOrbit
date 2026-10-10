#!/usr/bin/env node
// Local file sessions and prerequisite checks. No remote database connections yet.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {statSync} from 'node:fs';
import {createInterface} from 'node:readline';
import scannerModule from './scan.cjs';
import figureModule from './figure.cjs';

const command = process.argv[2] ?? 'help';
if (command === 'agent') {
  const scanner=scannerModule.createScanner();
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  const jobs=new Set();
  input.on('line',line=>{
    const job=(async()=>{
      let envelope;
      try{
        if(Buffer.byteLength(line)>64_000)throw new Error('Request exceeds 64 KB.');
        envelope=JSON.parse(line);
        const {requestId,spec}=envelope;
        if(typeof requestId!=='string' && typeof requestId!=='number')throw new Error('Provide requestId and spec.');
        let result;
        if(spec?.action==='capabilities'){
          result={protocol:1,formats:['parquet'],actions:['inspect','page','axes','panel','summary','figure-data','figure','cancel'],pageRows:100,maxColumns:24,maxPeriods:4096,queryTimeoutSeconds:30};
        }else if(spec?.action==='figure'){
          const data=await scanner.request({...spec,action:'figure-data'});
          result={data,rendering:await figureModule.renderFigure({...data,preset:spec.preset??'nature',size:spec.size??'single',
            xlabel:spec.xlabel??data.xlabel,ylabel:spec.ylabel??data.ylabel})};
        }else result=await scanner.request(spec);
        process.stdout.write(JSON.stringify({requestId,ok:true,result})+'\n');
      }catch(error){process.stdout.write(JSON.stringify({requestId:envelope?.requestId??null,ok:false,error:error.message})+'\n');}
    })();
    jobs.add(job);job.finally(()=>jobs.delete(job));
  });
  input.on('close',async()=>{await Promise.allSettled([...jobs]);scanner.close();});
  process.on('SIGINT',()=>{scanner.close();process.exit(130);});
  process.on('SIGTERM',()=>{scanner.close();process.exit(143);});
} else if (command === 'open') {
  const file=process.argv[3],portIndex=process.argv.indexOf('--port');
  if(!file)throw new Error('Usage: node scripts/tableorbit.mjs open file-or-folder [--port 4318]');
  if(portIndex>=0){const port=Number(process.argv[portIndex+1]);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port.');process.env.PORT=String(port);}
  process.env.TABLEORBIT_OPEN_FILE=path.resolve(file);
  const stat=statSync(process.env.TABLEORBIT_OPEN_FILE);
  if(!stat.isDirectory() && (!stat.isFile() || path.extname(file).toLowerCase()!=='.parquet'))throw new Error('Choose a local Parquet file or dataset folder.');
  await import('./serve.cjs');
} else if (command === 'doctor') {
  const probe = (file,args) => {
    try {
      const output=execFileSync(file,args,{encoding:'utf8',timeout:5000,maxBuffer:64000,windowsHide:true,stdio:['ignore','pipe','pipe']});
      return {available:true,version:output.match(/\b\d+\.\d+(?:\.\d+){0,2}\b/)?.[0] ?? 'available'};
    } catch (error) { return {available:false,reason:error.code === 'ENOENT' ? 'not on PATH' : 'version check failed'}; }
  };
  const pythonPath=process.env.PANEL_SPACE_PYTHON || 'python';
  const python=probe(pythonPath,['--version']);
  let drivers={};
  if (python.available) {
    try {
      drivers=JSON.parse(execFileSync(pythonPath,['-c',
        'import importlib.util,json; print(json.dumps({m: importlib.util.find_spec(m) is not None for m in ["duckdb", "mssql_python", "pyodbc"]}))'
      ],{encoding:'utf8',timeout:5000,maxBuffer:64000,windowsHide:true,stdio:['ignore','pipe','pipe']}));
    } catch { drivers={status:'could not inspect Python packages'}; }
  }
  console.log(JSON.stringify({node:process.version,databricks:probe('databricks',['--version']),
    sqlcmd:probe('sqlcmd',['-?']),python,pythonSqlDrivers:drivers,
    liveConnectionTested:false,remoteConnectorsImplemented:false},null,2));
} else if (command === 'help' || command === '--help') {
  console.log('TableOrbit CLI\n\n  node scripts/tableorbit.mjs agent (JSON Lines on stdin/stdout)\n  node scripts/tableorbit.mjs doctor\n  node scripts/tableorbit.mjs open file-or-folder [--port 4318]\n\nOpen starts a local reader session. Visit the printed URL to scan the file on demand.\nRemote database connection commands are not implemented yet.');
} else {
  console.error(`Unknown command: ${command}. Use --help.`); process.exitCode=1;
}
