#!/usr/bin/env node
// Local file sessions and prerequisite checks. No remote database connections yet.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {statSync} from 'node:fs';

const command = process.argv[2] ?? 'help';
if (command === 'open') {
  const file=process.argv[3],portIndex=process.argv.indexOf('--port');
  if(!file || path.extname(file).toLowerCase()!=='.parquet')throw new Error('Usage: node scripts/tableorbit.mjs open file.parquet [--port 4318]');
  if(portIndex>=0){const port=Number(process.argv[portIndex+1]);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port.');process.env.PORT=String(port);}
  process.env.TABLEORBIT_OPEN_FILE=path.resolve(file);
  if(!statSync(process.env.TABLEORBIT_OPEN_FILE).isFile())throw new Error('Choose a local Parquet file.');
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
  console.log('TableOrbit development CLI\n\n  node scripts/tableorbit.mjs doctor\n  node scripts/tableorbit.mjs open file.parquet [--port 4318]\n\nOpen starts a local reader session. Visit the printed URL to scan the file on demand.\nRemote database connection commands are not implemented yet.');
} else {
  console.error(`Unknown command: ${command}. Use --help.`); process.exitCode=1;
}
