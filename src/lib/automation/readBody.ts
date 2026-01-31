import { MAX_BODY_BYTES } from "./limits";

export async function readJsonBodyWithLimit(req: Request): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  return readJsonBodyWithLimitBytes(req, MAX_BODY_BYTES);
}

export async function readJsonBodyWithLimitBytes(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return { ok: false, error: "Content-Type must be application/json." };
  }

  const raw = await req.text();
  if (raw.length > Math.max(0, maxBytes)) return { ok: false, error: "Request body too large." };

  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
}

