// Local vault cryptographic primitives. This module is intentionally not wired
// into existing storage until migration/backup and recovery flows are tested.
const FORMAT_VERSION = 1;
const ALGORITHM = 'AES-GCM';
const KDF = 'PBKDF2-SHA-256';
const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 2_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_CIPHERTEXT_BYTES = 50 * 1024 * 1024;
const encoder = new TextEncoder();

function subtleCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Secure cryptography is unavailable. Open the app in a supported secure context (HTTPS).');
  }
  return globalThis.crypto.subtle;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw new Error('Invalid encrypted payload.');
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new Error('Invalid encrypted payload.');
  }
  if (binary.length > maxBytes) throw new Error('Encrypted payload is too large.');
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('Use a vault passphrase with at least 12 characters.');
  }
}

function additionalData(iterations) {
  return encoder.encode(`portfolio-vault|v${FORMAT_VERSION}|${ALGORITHM}|${KDF}|${iterations}`);
}

async function deriveKey(passphrase, salt, iterations) {
  validatePassphrase(passphrase);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('Unsupported key-derivation parameters.');
  }
  const subtle = subtleCrypto();
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a JSON-serializable value with a passphrase.
 * The envelope contains only KDF metadata, salt, nonce, and authenticated ciphertext.
 * The passphrase and derived CryptoKey are never returned or persisted by this module.
 */
export async function encryptJson(value, passphrase) {
  validatePassphrase(passphrase);
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Value must be JSON-serializable.');
  const plaintext = encoder.encode(serialized);
  if (plaintext.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error('Data is too large to encrypt in one operation.');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const iterations = DEFAULT_ITERATIONS;
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await subtleCrypto().encrypt(
    { name: ALGORITHM, iv, additionalData: additionalData(iterations), tagLength: 128 },
    key,
    plaintext
  );

  return Object.freeze({
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    kdf: KDF,
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  });
}

/** Decrypt and authenticate an envelope produced by encryptJson(). */
export async function decryptJson(envelope, passphrase) {
  validatePassphrase(passphrase);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      envelope.version !== FORMAT_VERSION || envelope.algorithm !== ALGORITHM || envelope.kdf !== KDF) {
    throw new Error('Unsupported encrypted payload format.');
  }
  const salt = base64ToBytes(envelope.salt, SALT_BYTES);
  const iv = base64ToBytes(envelope.iv, IV_BYTES);
  const ciphertext = base64ToBytes(envelope.ciphertext, MAX_CIPHERTEXT_BYTES);
  if (salt.byteLength !== SALT_BYTES || iv.byteLength !== IV_BYTES || ciphertext.byteLength < 16) {
    throw new Error('Invalid encrypted payload.');
  }

  try {
    const key = await deriveKey(passphrase, salt, envelope.iterations);
    const plaintext = await subtleCrypto().decrypt(
      { name: ALGORITHM, iv, additionalData: additionalData(envelope.iterations), tagLength: 128 },
      key,
      ciphertext
    );
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    // Do not reveal whether the passphrase was wrong or the ciphertext was modified.
    throw new Error('Unable to unlock data: passphrase is incorrect or the encrypted payload is damaged.');
  }
}

export const vaultCryptoInfo = Object.freeze({
  version: FORMAT_VERSION,
  algorithm: ALGORITHM,
  kdf: KDF,
  iterations: DEFAULT_ITERATIONS,
  saltBytes: SALT_BYTES,
  nonceBytes: IV_BYTES
});
