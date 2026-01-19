import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const POLITICO_COOKIE_NAME = "mp_politico";

type Session = {
  tokenId: string;
  politicianId: string;
  exp: number; // unix seconds
};

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : null;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createPoliticoSessionCookieValue(s: Session): string | null {
  const secret = env("POLITICO_SESSION_SECRET");
  if (!secret) return null;

  const payload = `${s.tokenId}|${s.politicianId}|${s.exp}`;
  const sig = sign(payload, secret);
  return `${b64url(payload)}.${sig}`;
}

export function readPoliticoSessionCookieValue(value: string | undefined): Session | null {
  if (!value) return null;
  const secret = env("POLITICO_SESSION_SECRET");
  if (!secret) return null;

  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return null;

  let payload: string;
  try {
    payload = unb64url(payloadB64);
  } catch {
    return null;
  }

  const expected = sign(payload, secret);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const [tokenId, politicianId, expRaw] = payload.split("|");
  const exp = Number(expRaw);
  if (!tokenId || !politicianId || !Number.isFinite(exp)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;

  return { tokenId, politicianId, exp };
}

