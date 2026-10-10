import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import scannerModule from '../scripts/scan.cjs';
const python=process.env.PANEL_SPACE_PYTHON||'python';

test('worker reuse, recoverable query errors, cancellation and source handles',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'tableorbit-worker-test-')),file=path.join(dir,'small.parquet');
  execFileSync(python,['-c',"import duckdb,sys; duckdb.sql('select i as id, 2020 as year, i*2 as value from range(200) t(i)').write_parquet(sys.argv[1])",file]);
  const scanner=scannerModule.createScanner(python);
  try{
    const meta=await scanner.request({action:'inspect',path:file});
    const page=await scanner.request({action:'page',id:meta.id,columns:['id']});
    assert.equal(page.metrics.workerPid,meta.metrics.workerPid);
    assert.equal(page.rows.length,100);
    await assert.rejects(scanner.request({action:'page',id:meta.id,columns:['nonexistent']}));
    const next=await scanner.request({action:'page',id:meta.id,columns:['id'],offset:100});
    assert.equal(next.metrics.workerPid,meta.metrics.workerPid);
    assert.equal(next.rows[0].id,'100');
    const pending=scanner.request({action:'summary',id:meta.id,columns:['value']});
    const rejection=assert.rejects(pending,/cancelled/);
    await scanner.request({action:'cancel'});await rejection;
    const restarted=await scanner.request({action:'page',id:meta.id,columns:['id']});
    assert.notEqual(restarted.metrics.workerPid,meta.metrics.workerPid);
    assert.equal(restarted.rows[0].id,'0');
  }finally{
    scanner.close();
    assert.equal(path.dirname(dir),path.resolve(tmpdir()));
    rmSync(dir,{recursive:true,force:true});
  }
});
