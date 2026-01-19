import { MAX_BODY_BYTES } from "./limits";

export async function readJsonBodyWithLimit(req: Request): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return { ok: false, error: "Content-Type must be application/json." };
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return { ok: false, error: "Request body too large." };

  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
}

