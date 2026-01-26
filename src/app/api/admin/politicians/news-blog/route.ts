import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = isNonEmptyString(b.candidate_id) ? b.candidate_id.trim() : "";
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });

  const apiToken = (process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN ?? "").trim();
  if (!apiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const origin = new URL(req.url).origin;
  const target = `${origin}/api/automation/editorial-orchestrate`;

  const modeRaw = isNonEmptyString(b.mode) ? b.mode.trim().toLowerCase() : "both";
  // IMPORTANT: run viral first so "grave" becomes the newest item (top of public feed).
  const modes: Array<"grave" | "viral"> = modeRaw === "grave" ? ["grave"] : modeRaw === "viral" ? ["viral"] : ["viral", "grave"];

  const results: any[] = [];
  for (const news_mode of modes) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", "x-automation-token": apiToken },
      body: JSON.stringify({ candidate_id, max_items: 1, news_mode }),
      cache: "no-store",
    });
    // eslint-disable-next-line no-await-in-loop
    const txt = await resp.text().catch(() => "");
    let json: any = null;
    try {
      json = JSON.parse(txt);
    } catch {
      // ignore
    }
    results.push({ news_mode, status: resp.status, ok: resp.ok, response: json ?? { body: txt.slice(0, 4000) } });
  }

  const ok = results.every((r) => r.ok || r.response?.skipped);
  return NextResponse.json({ ok, candidate_id, results }, { status: ok ? 200 : 207 });
}

