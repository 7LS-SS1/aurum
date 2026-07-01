import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM envelope for WordPress application passwords / JWTs.
 * GCM's auth tag detects ciphertext tampering, not just decrypt failures.
 *
 * Rotate ENCRYPTION_KEY only via a migration that re-encrypts every row —
 * losing the key makes every stored credential permanently unrecoverable.
 */
const ALGO = "aes-256-gcm";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

function key(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12); // 96-bit nonce, recommended size for GCM
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
