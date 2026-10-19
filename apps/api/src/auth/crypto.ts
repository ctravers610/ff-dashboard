// Small, auditable crypto helpers built only on node:crypto.

import crypto from 'node:crypto';

const GENERATE_HINT = `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

/** Parses TOKEN_ENCRYPTION_KEY: exactly 32 random bytes, base64-encoded. */
export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64.trim(), 'base64');
  if (key.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded. ${GENERATE_HINT}`);
  return key;
}

// AES-256-GCM: encrypts and authenticates, so a tampered value fails to decrypt
// instead of producing garbage. A fresh 12-byte IV per value means the same
// token never encrypts to the same text twice. Stored as "v1.iv.tag.ciphertext"
// so the format can change later without breaking existing values.
const VERSION = 'v1';

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognized encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

/** A new unguessable session or state token (256 bits). */
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

/** What gets stored instead of a session token. */
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Compares secrets in constant time, so response timing can't leak how much matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
