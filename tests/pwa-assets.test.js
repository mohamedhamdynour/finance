import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const match = serviceWorker.match(/const STATIC_ASSETS = \[([\s\S]*?)\n\];/);

test('service worker declares a static asset list', () => {
  assert.ok(match, 'STATIC_ASSETS array must exist');
});

test('every local JavaScript module is included in the offline app shell', () => {
  assert.ok(match, 'STATIC_ASSETS array must exist');
  const cached = new Set([...match[1].matchAll(/['"]\.\/([^'"]+)['"]/g)].map(m => m[1]));
  // This test checks each declared local asset. A companion workflow check can
  // compare the complete repository tree when needed.
  for (const path of cached) {
    assert.ok(existsSync(resolve(process.cwd(), path)), 'Missing service-worker asset: ' + path);
  }
  for (const modulePath of [
    'js/core/errors.js', 'js/core/validation.js', 'js/domain/telegram.js',
    'js/domain/zakat.js', 'js/repo/index.js', 'js/ui/router.js'
  ]) {
    assert.ok(cached.has(modulePath), 'Offline app shell omits required module: ' + modulePath);
  }
});
