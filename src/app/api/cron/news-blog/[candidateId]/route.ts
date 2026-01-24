import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function requireCronAuth(req: Request): boolean {
  const secret = normalizeToken(process.env.CRON_SECRET);
  if (!secret) return false;
  const auth = normalizeToken(req.headers.get("authorization") ?? "");
  return auth === `Bearer ${secret}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const req = _req;
  if (!requireCronAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiToken = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  if (!apiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { candidateId } = await ctx.params;
  const candidate_id = String(candidateId || "").trim();
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const target = `${origin}/api/automation/editorial-orchestrate`;

  // Cron wrapper: delegates to the unified editorial engine (RSS+GDELT+media+tone).
  const payload = { candidate_id, max_items: 1 };
  const resp = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", "x-automation-token": apiToken },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    // ignore
  }
  return NextResponse.json(json ?? { ok: resp.ok, status: resp.status, body: txt.slice(0, 4000) }, { status: resp.status });
}

