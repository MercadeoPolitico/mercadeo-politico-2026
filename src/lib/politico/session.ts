import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const POLITICO_COOKIE_NAME = "mp_politico";

export type PoliticoSession =
  | {
      mode: "env";
      tokenId: string;
      politicianId: string;
      exp: number; // unix seconds
    }
  | {
      // Fallback mode when an env secret is not configured.
      // Signature verification is performed server-side using the token_hash stored in DB.
      mode: "token";
      tokenId: string;
      politicianId: string;
      exp: number; // unix seconds
      sig: string;
      payload: string;
    };

type Session = {
  tokenId: string;
  politicianId: string;
  exp: number; // unix seconds
};

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : null;
}

function sessionSecret(): string | null {
  // Prefer dedicated secret, but allow safe fallbacks so the portal works
  // in deployments where only CRON_SECRET / NEXTAUTH_SECRET is configured.
  // IMPORTANT: this must remain a secret value (never a hardcoded constant).
  return (
    env("POLITICO_SESSION_SECRET") ||
    env("MP26_POLITICO_SESSION_SECRET") ||
    env("NEXTAUTH_SECRET") ||
    env("CRON_SECRET") ||
    // Last-resort fallback: still secret, widely configured in this project.
    // Using it ONLY for signing the portal cookie (not for DB access).
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    null
  );
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

export function createPoliticoSessionCookieValue(args: Session & { tokenHashSecret?: string | null }): string | null {
  const payload = `${args.tokenId}|${args.politicianId}|${args.exp}`;

  const envSecret = sessionSecret();
  if (envSecret) {
    const sig = sign(payload, envSecret);
    return `env.${b64url(payload)}.${sig}`;
  }

  const tokenSecret = typeof args.tokenHashSecret === "string" && args.tokenHashSecret.trim() ? args.tokenHashSecret.trim() : null;
  if (!tokenSecret) return null;
  const sig = sign(payload, tokenSecret);
  return `token.${b64url(payload)}.${sig}`;
}

export function readPoliticoSessionCookieValue(value: string | undefined): PoliticoSession | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [modeRaw, payloadB64, sig] = parts;
  const mode = modeRaw === "env" ? "env" : modeRaw === "token" ? "token" : null;
  if (!mode || !payloadB64 || !sig) return null;

  let payload: string;
  try {
    payload = unb64url(payloadB64);
  } catch {
    return null;
  }

  const [tokenId, politicianId, expRaw] = payload.split("|");
  const exp = Number(expRaw);
  if (!tokenId || !politicianId || !Number.isFinite(exp)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;

  if (mode === "env") {
    const secret = sessionSecret();
    if (!secret) return null;
    const expected = sign(payload, secret);
    try {
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    return { mode: "env", tokenId, politicianId, exp };
  }

  // mode === "token": do NOT verify here (needs DB lookup).
  return { mode: "token", tokenId, politicianId, exp, sig, payload };
}

