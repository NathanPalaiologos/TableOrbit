// Check local Markdown links and packaged images without network access.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packaged = new Set([...manifest.files, 'package.json']);

function markdownFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.name.endsWith('.md') ? [file] : [];
  });
}

const files = [
  ...fs.readdirSync(root).filter(name => name.endsWith('.md')).map(name => path.join(root, name)),
  ...markdownFiles(path.join(root, 'docs')),
  ...markdownFiles(path.join(root, 'archive', '2026-10-10-retired-prototype')),
];
const relative = file => path.relative(root, file).split(path.sep).join('/');
const slug = text => text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
let links = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    const [filename, anchor] = target.split('#');
    const destination = filename ? path.resolve(path.dirname(file), decodeURI(filename)) : file;
    assert(fs.existsSync(destination), `${relative(file)}: missing ${target}`);
    if (packaged.has(relative(file))) {
      assert(packaged.has(relative(destination)), `${relative(file)}: package omits ${target}`);
    }
    if (anchor && destination.endsWith('.md')) {
      const headings = [...fs.readFileSync(destination, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)];
      assert(headings.some(heading => slug(heading[1].trim()) === decodeURI(anchor)),
        `${relative(file)}: missing heading ${target}`);
    }
    links++;
  }
}

for (const file of manifest.files.filter(name => name.startsWith('docs/images/') && name.endsWith('.jpg'))) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `Expected JPEG: ${file}`);
}
console.log(`Checked ${files.length} Markdown files and ${links} local links. Package links and image headers passed.`);
