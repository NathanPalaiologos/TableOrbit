// Check the explicit VSIX payload without installing tools or packaging data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const files=new Set(manifest.files);
assert.equal(files.size,manifest.files.length,'Duplicate package entries');
let bytes=0;
for(const name of files){
  assert(!name.includes('..') && !path.isAbsolute(name) && !/[?*]/.test(name),`Use explicit relative files: ${name}`);
  assert(!/\.(parquet|log|env|vsix)$/i.test(name),`Private/generated file in package: ${name}`);
  const file=path.join(root,name),stat=fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(),`Expected a regular file: ${name}`);
  bytes+=stat.size;
  if(name.endsWith('.mjs')){
    const source=fs.readFileSync(file,'utf8');
    for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
      const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));
      assert(files.has(dependency),`Missing runtime import: ${dependency}`);
    }
  }
}
for(const required of ['extension.cjs','web/index.html','web/style.css','scripts/scan.cjs','scripts/scan_file.py','scripts/lazy_queries.py','scripts/tableorbit.mjs','scripts/figure.cjs','scripts/render_figure.py','web/data/grunfeld.csv','web/data/gapminder.tsv','web/data/nlswork.csv'])assert(files.has(required),`Missing runtime file: ${required}`);
assert.equal(manifest.capabilities.untrustedWorkspaces.supported,false);
assert.equal(manifest.capabilities.virtualWorkspaces.supported,false);
if(process.argv.includes('--publish'))assert(manifest.publisher!=='tableorbit-local','Set a verified Marketplace publisher before publishing');
console.log(JSON.stringify({files:files.size,uncompressedBytes:bytes,localPayloadCheck:'passed',marketplacePublisherVerified:false},null,2));
