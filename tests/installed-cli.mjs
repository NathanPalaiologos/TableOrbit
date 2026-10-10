// Opt-in end-to-end check against an installed VSIX, not repository imports.
// Fixture: ('001',2020,0), ('001',2021,NULL), ('002',2020,4).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';

const [extension,fixture,output]=process.argv.slice(2);
assert(extension && fixture && output,'Provide installed extension, fixture and output paths.');
const cli=path.join(extension,'scripts','tableorbit.mjs');
const child=spawn(process.execPath,[cli,'agent'],{cwd:path.dirname(fixture),windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let serial=0,stderr='';
child.stderr.on('data',chunk=>{stderr+=chunk;});
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
  const reply=JSON.parse(line),job=pending.get(reply.requestId);
  assert(job,'Unexpected reply ID');pending.delete(reply.requestId);clearTimeout(job.timer);job.resolve(reply);
});
function request(spec){
  const requestId=++serial;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('CLI reply timed out'));},45000);
    pending.set(requestId,{resolve,reject,timer});
    child.stdin.write(JSON.stringify({requestId,spec})+'\n');
  });
}
async function query(spec){const reply=await request(spec);assert(reply.ok,reply.error);return reply.result;}
const report={};
try{
  assert((await query({action:'capabilities'})).actions.includes('figure'));
  const meta=await query({action:'inspect',path:fixture});
  assert.equal(meta.rows,'3');assert.equal(meta.fileCount,1);
  const base={id:meta.id,columns:['revenue'],entity:'firm',time:'year'};
  const page=await query({...base,action:'page',columns:['firm','year','revenue']});
  assert.equal(page.rows[0].firm,'001');assert.equal(page.rows[0].revenue,'0.0');
  assert.equal(page.metrics.workerPid,meta.metrics.workerPid);
  const axes=await query({...base,action:'axes'});
  assert.equal(axes.absent,'1');assert.deepEqual(axes.times,['2020','2021']);
  const cross=await query({...base,action:'panel',view:'cross',period:'2021'});
  assert.deepEqual(cross.rows,[['001',null],['002',null]]);
  assert.deepEqual(cross.present,[[true],[false]]);
  const series=await query({...base,action:'panel',view:'series',variable:'revenue'});
  assert.deepEqual(series.rows,[['001','0.0',null],['002','4.0',null]]);
  const summary=await query({...base,action:'summary',offset:1000});
  const stat=summary.rows[0];
  assert.deepEqual([stat.n,stat.missing,stat.absent],['2','1','1']);
  assert.equal(Number(stat.mean),2);assert.equal(Number(stat.q25),1);assert.equal(Number(stat.q75),3);
  assert(Math.abs(Number(stat.sd)-Math.sqrt(8))<1e-12);
  const filtered=await query({...base,action:'summary',timeRange:{column:'year',start:'2021',end:'2021'}});
  assert.equal(filtered.rows[0].n,'0');assert.equal(filtered.rows[0].missing,'1');
  const plot=await query({...base,action:'figure',variable:'revenue',plot:'line',aggregation:'mean',preset:'nature',size:'single'});
  assert.deepEqual(plot.data.series[0].points.map(p=>p.y),[2,null]);
  assert.equal(plot.data.metadata.inputCount,2);
  const svg=Buffer.from(plot.rendering.files.svg,'base64');
  const pdf=Buffer.from(plot.rendering.files.pdf,'base64');
  const png=Buffer.from(plot.rendering.files.png,'base64');
  assert(svg.toString().includes('<svg'));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  await fs.mkdir(output,{recursive:true});
  for(const [format,content] of Object.entries({svg,pdf,png}))await fs.writeFile(path.join(output,'installed-cli-figure.'+format),content);
  const invalid=await request({...base,action:'page',columns:['not_a_column']});assert.equal(invalid.ok,false);
  // Cancel in the same input burst, before the tiny query can reply.
  const interrupted=request({...base,action:'summary'});
  const cancelled=await query({action:'cancel'});assert(cancelled.cancelled);
  assert.equal((await interrupted).ok,false);
  const resumed=await query({...base,action:'page'});
  assert.notEqual(resumed.metrics.workerPid,meta.metrics.workerPid);
  const folder=await query({action:'inspect',path:path.dirname(fixture)});
  assert.equal(folder.rows,'3');assert.equal(folder.fileCount,1);
  Object.assign(report,{status:'passed',installedExtension:extension,sourceRows:3,leadingZeroKeys:true,workerReuse:true,
    panelMissingVsAbsent:true,fullScopeSummary:true,typedTimeFilter:true,figureFormats:['svg','pdf','png'],
    queryErrorRecovery:true,cancelAndRestart:true,folderReading:true,figureBytes:{svg:svg.length,pdf:pdf.length,png:png.length}});
  await fs.writeFile(path.join(output,'installed-cli-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  const exited=new Promise(resolve=>child.once('exit',resolve));
  child.stdin.end();
  const timer=setTimeout(()=>child.kill(),5000);
  const code=await exited;clearTimeout(timer);
  for(const job of pending.values())clearTimeout(job.timer);
  assert.equal(code,0,stderr);
}
