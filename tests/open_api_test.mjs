// Opt-in check against the local preview server, using a generated tiny file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('file routes require a local session and preserve text on a successful open',async()=>{
  const origin='http://127.0.0.1:4317';
  const html=await (await fetch(origin)).text();
  const token=html.match(/name="tableorbit-session" content="([^"]+)"/)?.[1];
  assert(token);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tableorbit-open-test-'));
  const file=path.join(directory,'sample.csv');
  try{
    await fs.writeFile(file,'id,note\n001,hello\n001,again');
    const request=(headers,input)=>fetch(origin+'/api/open',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
    assert.equal((await request({Origin:origin},{path:file})).status,403);
    assert.equal((await request({Origin:'https://example.com','X-TableOrbit-Session':token},{path:file})).status,403);
    const headers={Origin:origin,'X-TableOrbit-Session':token};
    const response=await request(headers,{path:file});assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.text,'id,note\n001,hello\n001,again');
    assert.equal((await request(headers,{path:'"'+file+'"'})).status,200);
    assert.equal((await request(headers,{path:path.join(directory,'missing.csv')})).status,400);
    assert.equal((await request(headers,{path:file})).status,200);
  }finally{
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));
    assert.equal(path.dirname(file),directory);
    await fs.unlink(file);await fs.rmdir(directory);
  }
});
