import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson, decryptJson, vaultCryptoInfo } from '../js/security/crypto.js';

test('encrypted JSON round-trips and does not expose plaintext in the envelope', async () => {
  const value = {
    accounts: [{ name: 'Private account label', balance: 12345.67, currency: 'EGP' }],
    transactions: [{ note: 'private note', amount: -250 }],
    unicode: 'محفظتي المالية 🔐'
  };
  const passphrase = 'correct horse battery staple 2026';
  const envelope = await encryptJson(value, passphrase);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, 'AES-GCM');
  assert.equal(envelope.kdf, 'PBKDF2-SHA-256');
  assert.equal(envelope.iterations, 600000);
  assert.equal(JSON.stringify(envelope).includes('Private account label'), false);
  assert.deepEqual(await decryptJson(envelope, passphrase), value);
});

test('encryptJson uses a fresh salt and nonce for each encryption', async () => {
  const a = await encryptJson({ value: 1 }, 'a sufficiently long passphrase');
  const b = await encryptJson({ value: 1 }, 'a sufficiently long passphrase');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.equal(vaultCryptoInfo.nonceBytes, 12);
});

test('wrong passphrases and tampered ciphertext fail closed', async () => {
  const envelope = await encryptJson({ sensitive: true }, 'a sufficiently long passphrase');
  await assert.rejects(() => decryptJson(envelope, 'a different long passphrase'), /incorrect or the encrypted payload is damaged/);
  const tampered = { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) };
  await assert.rejects(() => decryptJson(tampered, 'a sufficiently long passphrase'), /incorrect or the encrypted payload is damaged/);
});

test('invalid passphrases and unsupported envelopes are rejected', async () => {
  await assert.rejects(() => encryptJson({ ok: true }, 'short'), /at least 12 characters/);
  await assert.rejects(() => decryptJson({ version: 99 }, 'a sufficiently long passphrase'), /Unsupported encrypted payload format/);
  await assert.rejects(() => encryptJson(undefined, 'a sufficiently long passphrase'), /JSON-serializable/);
});
