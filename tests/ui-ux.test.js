import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('mobile navigation has an accessible toggle and dismissible overlay', () => {
  assert.match(html, /id="mobile-nav-toggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="mobile-nav-overlay"[^>]*onclick="toggleMobileNav\(false\)"/);
  assert.match(main, /function toggleMobileNav\(force\)/);
  assert.match(main, /if \(document\.body\.classList\.contains\('mobile-nav-open'\)\) toggleMobileNav\(false\)/);
});

test('mobile navigation drawer restores labels and reclaims narrow viewport', () => {
  assert.match(css, /body\.mobile-nav-open \.sidebar-wrap/);
  assert.match(css, /width: min\(300px, 88vw\)/);
  assert.match(css, /\.mobile-nav-overlay/);
});

test('mobile controls account for iOS safe areas and keyboard focus', () => {
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('backup export and restore use encrypted envelopes and a dedicated passphrase dialog', () => {
  assert.match(html, /id="modal-backup-passphrase"/);
  assert.match(html, /id="backup-passphrase-confirm"/);
  assert.match(main, /await encryptJson\(/);
  assert.match(main, /await decryptJson\(/);
  assert.match(main, /format: 'portfolio-encrypted-backup'/);
  assert.match(main, /هذه نسخة احتياطية غير مشفرة/);
  assert.match(main, /if \(!accepted\)[\s\S]*?input\.value = ''/);
});
