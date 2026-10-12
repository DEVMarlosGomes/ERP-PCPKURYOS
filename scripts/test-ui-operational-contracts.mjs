import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Last shared commit before either UI worktree started. A caller can override
// the baseline to verify a later revision: node <script> <git-reference>.
const baseline = process.argv[2] || '4052a55';
const files = fs.readdirSync(path.join(root, 'public')).filter(name => {
  if (!name.endsWith('.html')) return false;
  return fs.readFileSync(path.join(root, 'public', name), 'utf8').includes('data-kuryos-operational=""');
});
const htmlSegments = text => text.split(/(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->)/gi);
const withoutPresentationHooks = text => htmlSegments(text).map((part, i) => {
  if (i % 2) return part;
  return part.replace(/ data-kuryos-operational=""| data-ui="[^"]*"/g, '');
}).join('');
const scripts = text => [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(m => m[0]);
const styles = text => [...text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)].map(m => m[0]);
const attributes = (text, attr) => {
  const html = htmlSegments(text).filter((_, i) => !(i % 2)).join('');
  return [...html.matchAll(new RegExp(`\\b${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'))].map(m => m[0]);
};
assert.ok(files.length >= 35, 'Expected operational coverage across the ERP');
// Read all original blobs in one git process; each payload length is in bytes.
const originals = execFileSync('git', ['cat-file', '--batch'], {
  cwd: root,
  input: files.map(name => `${baseline}:public/${name}`).join('\n') + '\n',
  maxBuffer: 32 * 1024 * 1024,
});
const beforeByName = new Map();
let offset = 0;
for (const name of files) {
  const headerEnd = originals.indexOf(10, offset);
  const header = originals.subarray(offset, headerEnd).toString('utf8');
  const match = header.match(/^[a-f0-9]+ blob (\d+)$/);
  assert.ok(match, `${name}: original blob not found in ${baseline}: ${header}`);
  const length = Number(match[1]);
  const start = headerEnd + 1;
  beforeByName.set(name, originals.subarray(start, start + length).toString('utf8'));
  offset = start + length + 1;
}
let totalScripts = 0;
let totalIds = 0;
let totalHandlers = 0;
for (const name of files) {
  const relative = `public/${name}`;
  const before = beforeByName.get(name);
  const after = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.equal(withoutPresentationHooks(after), before, `${name}: only additive presentation hooks are permitted`);
  assert.deepEqual(scripts(after), scripts(before), `${name}: scripts must remain byte-for-byte identical`);
  assert.deepEqual(styles(after), styles(before), `${name}: operational and print styles must remain intact`);
  for (const attr of ['id', 'name', 'type', 'value', 'for', 'required', 'disabled', 'hidden', 'onclick', 'onchange', 'onsubmit', 'data-tab', 'data-maintab', 'data-sort']) {
    assert.deepEqual(attributes(after, attr), attributes(before, attr), `${name}: ${attr} contracts changed`);
  }
  totalScripts += scripts(after).length;
  totalIds += attributes(after, 'id').length;
  totalHandlers += ['onclick', 'onchange', 'onsubmit'].reduce((sum, attr) => sum + attributes(after, attr).length, 0);
}

const css = fs.readFileSync(path.join(root, 'public/shared/kuryos-ui-operational.css'), 'utf8');
assert.match(css, /@media screen/, 'Styles must opt in to screen media');
assert.doesNotMatch(css, /@media print/, 'Operational design must not replace document print geometry');
assert.doesNotMatch(css, /(?:#|\.)gantt-(?:grid|cell|slot)\s*\{/, 'Keep Gantt interaction geometry untouched');
console.log(`PASS: ${files.length} operational pages; ${totalScripts} scripts, ${totalIds} IDs and ${totalHandlers} inline event bindings unchanged against ${baseline}.`);
console.log('PASS: all original fields, labels, options, hidden states, tab values, script order and print styles are identical; only data-ui hooks added.');
