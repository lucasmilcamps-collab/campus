// Provider tokens at rest: AES-256-GCM, key from TOKEN_ENC_KEY.
// Stored layout: 12-byte IV | 16-byte tag | ciphertext.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

const key = () => Buffer.from(env().TOKEN_ENC_KEY, 'base64');

export function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
}
