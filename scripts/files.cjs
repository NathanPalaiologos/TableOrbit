const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const TEXT=['csv','tsv','tab','txt','psv','json','jsonl','ndjson'];
const BINARY=['xlsx','xlsm','feather','arrow','ipc','dta'];
const FORMATS=['parquet',...TEXT,...BINARY];

async function readData(file,{python=process.env.PANEL_SPACE_PYTHON||'python',sheet}={}) {
  if(typeof file==='string')file=file.trim().replace(/^(["'])(.*)\1$/s,'$2');
  if(!path.isAbsolute(file))throw new Error('Enter an absolute local file path.');
  const stat=await fs.stat(file),name=path.basename(file),extension=path.extname(file).slice(1).toLowerCase();
  if(stat.isDirectory() || extension==='parquet')return {parquet:file,name};
  if(!FORMATS.includes(extension))throw new Error('Unsupported file format. Choose a delimited text file, JSON records, Parquet, XLSX, Arrow or DTA.');
  if(TEXT.includes(extension)) {
    if(stat.size>10_000_000)throw new Error('Text imports are limited to 10 MB. Export large tables to Parquet for on-demand reading.');
    const bytes=await fs.readFile(file);
    const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
    let text;
    try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
    catch{throw new Error('Unsupported text encoding. Save the file as UTF-8 or UTF-16 with a BOM.');}
    return {text,name,path:file};
  }
  if(stat.size>64_000_000)throw new Error('Binary imports are limited to 64 MB. Export large tables to Parquet for on-demand reading.');
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(__dirname,'read_table.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    let output='',bytes=0;
    const timer=setTimeout(()=>{child.kill();reject(new Error('File import exceeded 30 seconds. Export a smaller subset.'));},30000);
    child.stdout.setEncoding('utf8');child.stderr.resume();
    child.stdout.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>12_000_000){child.kill();reject(new Error('Imported table exceeds the response limit.'));}else output+=chunk;});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Cannot start Python. Configure panelSpace.pythonPath or PANEL_SPACE_PYTHON.'));});
    child.on('close',()=>{
      clearTimeout(timer);
      try{const result=JSON.parse(output);if(result.error)reject(new Error(result.error));else resolve({...result,name,path:file});}
      catch{reject(new Error('Could not read the file. Check its format and the configured Python environment.'));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify({path:file,sheet}));
  });
}
module.exports={readData,FORMATS,TEXT,BINARY};
