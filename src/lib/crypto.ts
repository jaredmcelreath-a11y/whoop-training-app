import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

function key(): Buffer {
  return Buffer.from(getEnv().TOKEN_ENC_KEY, "base64");
}

/** AES-256-GCM. Blob: base64(iv).base64(tag).base64(ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted blob");
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted blob");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
