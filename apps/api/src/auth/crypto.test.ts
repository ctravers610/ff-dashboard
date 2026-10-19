import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashToken, parseKey, randomToken, safeEqual } from './crypto.js';

const key = crypto.randomBytes(32);

describe('encrypt / decrypt', () => {
  it('round-trips a token, including an empty string', () => {
    for (const secret of ['yahoo-refresh-token-123', '']) {
      expect(decrypt(encrypt(secret, key), key)).toBe(secret);
    }
  });

  it('never produces the same ciphertext twice (fresh IV each time)', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('does not contain the plaintext', () => {
    expect(encrypt('super-secret-value', key)).not.toContain('super-secret-value');
  });

  it('rejects a tampered value instead of returning garbage', () => {
    const [v, iv, tag, ct] = encrypt('yahoo-token', key).split('.');
    const flipped = Buffer.from(ct!, 'base64url');
    flipped[0]! ^= 1;
    expect(() => decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), key)).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => decrypt(encrypt('yahoo-token', key), crypto.randomBytes(32))).toThrow();
  });

  it('rejects values in an unknown format', () => {
    expect(() => decrypt('not-encrypted', key)).toThrow('Unrecognized encrypted value');
  });
});

describe('parseKey', () => {
  it('accepts 32 base64-encoded bytes', () => {
    expect(parseKey(crypto.randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('explains how to generate a key when the value is wrong', () => {
    expect(() => parseKey('too-short')).toThrow(/32 bytes.*Generate one with/);
  });
});

describe('tokens', () => {
  it('makes long random tokens and stores only a fixed-length hash of them', () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(randomToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('compares secrets safely, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
