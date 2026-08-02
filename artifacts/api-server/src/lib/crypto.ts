/**
 * TOTP secret encryption — AES-256-GCM
 *
 * The raw TOTP secret is never stored in plaintext. It is encrypted with a
 * 256-bit key derived from SESSION_SECRET via scryptSync, stored as
 * "<iv_hex>.<authTag_hex>.<ciphertext_hex>".
 */
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32; // 256 bits
const IV_LEN = 12; // 96-bit IV recommended for GCM
const SALT = "totp-secret-key-v1"; // static salt — key rotation requires re-encrypt

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for TOTP encryption");
  _key = scryptSync(secret, SALT, KEY_LEN) as Buffer;
  return _key;
}

export function encryptTotpSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptTotpSecret(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(".");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted TOTP secret format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
