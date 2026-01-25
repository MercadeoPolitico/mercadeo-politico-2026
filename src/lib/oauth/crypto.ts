import "server-only";
import crypto from "node:crypto";

type EncryptedPayload = {
  v: 1;
  alg: "A256GCM";
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
};

function env(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeKey(input: string): Buffer | null {
  const s = input.trim();
  // hex(32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  // base64(32 bytes)
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }
  return null;
}

function getKey(): Buffer {
  const raw = env("OAUTH_TOKEN_ENCRYPTION_KEY");
  const k = decodeKey(raw);
  if (!k) {
    throw new Error(
      "Invalid OAUTH_TOKEN_ENCRYPTION_KEY (must be 32 bytes base64 or 64 hex chars).",
    );
  }
  return k;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plaintext), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptSecret(payloadJson: string): string {
  const key = getKey();
  const payload = JSON.parse(payloadJson) as Partial<EncryptedPayload>;
  if (payload.v !== 1 || payload.alg !== "A256GCM") throw new Error("Unsupported ciphertext format");
  if (!payload.iv || !payload.tag || !payload.ct) throw new Error("Invalid ciphertext payload");

  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ct = Buffer.from(payload.ct, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomStateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

