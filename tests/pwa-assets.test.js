import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd();
const serviceWorker = readFileSync(resolve(root, 'sw.js'), 'utf8');
const match = serviceWorker.match(/const STATIC_ASSETS = \[([\s\S]*?)\n\];/);

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [relative(root, fullPath).split(sep).join('/')] : [];
  });
}

test('service worker declares a static asset list', () => {
  assert.ok(match, 'STATIC_ASSETS array must exist');
});

test('all declared local service-worker assets exist', () => {
  assert.ok(match, 'STATIC_ASSETS array must exist');
  const cached = [...match[1].matchAll(/['"]\.\/([^'"]+)['"]/g)].map(m => m[1]);
  for (const path of cached) {
    assert.ok(existsSync(resolve(root, path)), 'Missing service-worker asset: ' + path);
  }
});

test('every tracked JavaScript module is included in the offline app shell', () => {
  assert.ok(match, 'STATIC_ASSETS array must exist');
  const cached = new Set([...match[1].matchAll(/['"]\.\/([^'"]+)['"]/g)].map(m => m[1]));
  const modules = collectJavaScriptFiles(resolve(root, 'js'));
  const missing = modules.filter(path => !cached.has(path));
  assert.deepEqual(missing, [], 'JavaScript modules omitted from STATIC_ASSETS');
});

test('service worker caches only explicitly declared same-origin app-shell assets', () => {
  assert.match(serviceWorker, /staticAssetURLs\.has\(url\.href\)/);
  assert.match(serviceWorker, /STATIC_ASSETS\.map\(path => new URL\(path, self\.location\.href\)\.href\)/);
});
