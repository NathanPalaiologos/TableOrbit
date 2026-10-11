// Local-only preview. Serves the same web assets used by the VS Code extension.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { renderFigure } = require('./figure.cjs');
const {createScanner} = require('./scan.cjs');
const {readData,BINARY}=require('./files.cjs');
const os=require('node:os');
let importBusy=false;
const crypto = require('node:crypto');
const scanner = createScanner();
const scanToken = crypto.randomBytes(32).toString('hex');
const root = path.resolve(__dirname,'../web');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const port = Number(process.env.PORT || 4317);
http.createServer((req,res)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)) {
    res.writeHead(403); res.end(); return;
  }
  if(['/api/open','/api/import'].includes(req.url) && req.method==='POST') {
    if(![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin) || req.headers['x-tableorbit-session']!==scanToken || !req.headers['content-type']?.startsWith('application/json')){res.writeHead(403);res.end();return;}
    const limit=req.url==='/api/import'?14_000_000:64000;
    let body='',size=0;req.setEncoding('utf8');
    req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>limit){res.writeHead(413);res.end();req.destroy();}else body+=chunk;});
    req.on('end',async()=>{
      if(size>limit)return;
      if(importBusy){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'A file is opening. Wait for it to finish.'}));return;}
      importBusy=true;let temporary,file;
      try{
        const input=JSON.parse(body);let result;
        if(req.url==='/api/open')result=await readData(input.path,{sheet:input.sheet});
        else{
          const extension=path.extname(String(input.name)).slice(1).toLowerCase();
          if(!BINARY.includes(extension)||typeof input.base64!=='string')throw new Error('Unsupported binary import.');
          const bytes=Buffer.from(input.base64,'base64');if(bytes.length>10_000_000)throw new Error('Browser uploads are limited to 10 MB. Use a local path for larger files.');
          temporary=await fs.promises.mkdtemp(path.join(os.tmpdir(),'tableorbit-import-'));
          file=path.join(temporary,'input.'+extension);await fs.promises.writeFile(file,bytes);
          result=await readData(file,{sheet:input.sheet});delete result.path;result.name=path.basename(String(input.name));
        }
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
      finally{
        if(temporary && path.dirname(temporary)===path.resolve(os.tmpdir()) && file && path.dirname(file)===temporary){await fs.promises.unlink(file).catch(()=>{});await fs.promises.rmdir(temporary).catch(()=>{});}
        importBusy=false;
      }
    });return;
  }
  if(req.url === '/api/scan' && req.method === 'POST') {
    const origins = [`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    if(!origins.includes(req.headers.origin) || !origins.map(value=>new URL(value).host).includes(req.headers.host)
      || req.headers['x-tableorbit-session'] !== scanToken || !req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(403); res.end(); return;
    }
    let input='',bytes=0;
    req.setEncoding('utf8');
    req.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>64000){res.writeHead(413);res.end();req.destroy();}else input+=chunk;});
    req.on('end',async()=>{
      if(bytes>64000)return;
      try {const result=await scanner.request(JSON.parse(input));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
      catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
    });
    return;
  }
  if(req.url === '/api/figure' && req.method === 'POST') {
    const origin = req.headers.origin;
    if ((origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) || !req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(403); res.end(); return;
    }
    let input = '', bytes = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      bytes += Buffer.byteLength(chunk);
      if(bytes > 2_000_000) { res.writeHead(413); res.end(); req.destroy(); }
      else input += chunk;
    });
    req.on('end', async () => {
      if(bytes > 2_000_000) return;
      try {
        const result = await renderFigure(JSON.parse(input));
        res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
        res.end(JSON.stringify(result));
      } catch(error) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:error.message}));
      }
    });
    return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();
    else if(file===path.join(root,'index.html')) {
      const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const meta=`<meta name="tableorbit-session" content="${scanToken}"><meta name="tableorbit-file" content="${escape(process.env.TABLEORBIT_OPEN_FILE || '')}">`;
      res.end(fs.readFileSync(file,'utf8').replace('<head>','<head>'+meta));
    } else fs.createReadStream(file).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`TableOrbit: http://127.0.0.1:${port}`));
