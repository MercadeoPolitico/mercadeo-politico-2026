import { NextResponse } from "next/server";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/oauth/crypto";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function allow(req: Request): boolean {
  const apiToken = process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN;
  const headerToken = req.headers.get("x-automation-token") ?? "";
  if (!apiToken) return false;
  return normalizeToken(headerToken) === normalizeToken(apiToken);
}

type Destination = {
  network?: string;
  scope?: string;
  credential_ref?: string | null;
  candidate_id?: string;
  page_id?: string | null;
  account_id?: string | null;
  channel_id?: string | null;
};

export async function POST(req: Request) {
  if (!allow(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const destination = (b.destination as any) as Destination;
  const draft = (b.draft as any) ?? {};
  const media = (b.media as any) ?? null;

  const network = String(destination?.network ?? "").trim().toLowerCase();
  const candidateId = String(destination?.candidate_id ?? "").trim();
  const cred = String(destination?.credential_ref ?? "").trim();
  if (!candidateId) return NextResponse.json({ ok: false, error: "candidate_id_required" }, { status: 400 });
  if (!cred.startsWith("oauth:")) return NextResponse.json({ ok: false, error: "not_oauth_destination" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  // Resolve provider + target
  const provider = network === "facebook" || network === "instagram" || network === "threads" ? "meta" : network === "x" ? "x" : network === "reddit" ? "reddit" : "";
  if (!provider) return NextResponse.json({ ok: false, error: "unsupported_network" }, { status: 400 });

  const targetId =
    network === "facebook"
      ? String(destination?.page_id ?? "").trim()
      : network === "instagram" || network === "threads"
        ? String(destination?.account_id ?? "").trim()
        : network === "reddit"
          ? String(destination?.channel_id ?? destination?.account_id ?? "").trim()
          : "";

  // Fetch connection
  let q = admin.from("social_oauth_connections").select("id,external_id,access_token_enc,refresh_token_enc,expires_at,scopes,status").eq("provider", provider).eq("candidate_id", candidateId).eq("status", "active");
  if (provider === "meta" && targetId) q = q.eq("external_id", targetId);
  const { data: conn } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn) return NextResponse.json({ ok: false, error: "missing_oauth_connection" }, { status: 409 });

  const accessToken = decryptSecret(String(conn.access_token_enc));

  const text =
    network === "facebook"
      ? String((draft as any)?.variants?.facebook ?? "")
      : network === "instagram"
        ? String((draft as any)?.variants?.instagram ?? "")
        : network === "threads"
          ? String((draft as any)?.variants?.threads ?? "")
          : network === "x"
            ? String((draft as any)?.variants?.x ?? "")
            : network === "reddit"
              ? String((draft as any)?.variants?.reddit ?? "")
              : "";
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return NextResponse.json({ ok: false, error: "missing_variant" }, { status: 409 });

  const imageUrl = media && typeof (media as any).image_url === "string" ? String((media as any).image_url) : null;

  try {
    if (network === "facebook") {
      if (!targetId) return NextResponse.json({ ok: false, error: "missing_page_id" }, { status: 409 });
      const version = String(process.env.MP26_META_GRAPH_VERSION || "v20.0");

      if (imageUrl) {
        const u = new URL(`https://graph.facebook.com/${version}/${targetId}/photos`);
        u.searchParams.set("url", imageUrl);
        u.searchParams.set("caption", trimmed);
        u.searchParams.set("published", "true");
        u.searchParams.set("access_token", accessToken);
        const r = await fetch(u.toString(), { method: "POST", cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: j }, { status: 502 });
        return NextResponse.json({ ok: true, status: "published", response: j });
      }

      const u = new URL(`https://graph.facebook.com/${version}/${targetId}/feed`);
      u.searchParams.set("message", trimmed);
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u.toString(), { method: "POST", cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: j }, { status: 502 });
      return NextResponse.json({ ok: true, status: "published", response: j });
    }

    if (network === "instagram") {
      const igUserId = targetId;
      if (!igUserId) return NextResponse.json({ ok: false, error: "missing_account_id" }, { status: 409 });
      if (!imageUrl) return NextResponse.json({ ok: false, error: "instagram_requires_image" }, { status: 409 });
      const version = String(process.env.MP26_META_GRAPH_VERSION || "v20.0");

      // 1) Create media container
      const createUrl = new URL(`https://graph.facebook.com/${version}/${igUserId}/media`);
      createUrl.searchParams.set("image_url", imageUrl);
      createUrl.searchParams.set("caption", trimmed);
      createUrl.searchParams.set("access_token", accessToken);
      const c = await fetch(createUrl.toString(), { method: "POST", cache: "no-store" });
      const cj = await c.json().catch(() => null);
      const creationId = cj?.id ? String(cj.id) : "";
      if (!c.ok || !creationId) return NextResponse.json({ ok: false, error: "upstream_error", response: cj }, { status: 502 });

      // 2) Publish
      const pubUrl = new URL(`https://graph.facebook.com/${version}/${igUserId}/media_publish`);
      pubUrl.searchParams.set("creation_id", creationId);
      pubUrl.searchParams.set("access_token", accessToken);
      const p = await fetch(pubUrl.toString(), { method: "POST", cache: "no-store" });
      const pj = await p.json().catch(() => null);
      if (!p.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: pj }, { status: 502 });
      return NextResponse.json({ ok: true, status: "published", response: pj });
    }

    if (network === "threads") {
      const threadsUserId = targetId;
      if (!threadsUserId) return NextResponse.json({ ok: false, error: "missing_account_id" }, { status: 409 });
      const base = String(process.env.MP26_THREADS_GRAPH_BASE || "https://graph.threads.net/v1.0").replace(/\/+$/, "");

      // Threads: create then publish (text-only)
      const createUrl = new URL(`${base}/${threadsUserId}/threads`);
      createUrl.searchParams.set("media_type", "TEXT");
      createUrl.searchParams.set("text", trimmed.slice(0, 500));
      createUrl.searchParams.set("access_token", accessToken);
      const c = await fetch(createUrl.toString(), { method: "POST", cache: "no-store" });
      const cj = await c.json().catch(() => null);
      const creationId = cj?.id ? String(cj.id) : "";
      if (!c.ok || !creationId) return NextResponse.json({ ok: false, error: "upstream_error", response: cj }, { status: 502 });

      const pubUrl = new URL(`${base}/${threadsUserId}/threads_publish`);
      pubUrl.searchParams.set("creation_id", creationId);
      pubUrl.searchParams.set("access_token", accessToken);
      const p = await fetch(pubUrl.toString(), { method: "POST", cache: "no-store" });
      const pj = await p.json().catch(() => null);
      if (!p.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: pj }, { status: 502 });
      return NextResponse.json({ ok: true, status: "published", response: pj });
    }

    if (network === "x") {
      const r = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed.slice(0, 280) }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: j }, { status: 502 });
      return NextResponse.json({ ok: true, status: "published", response: j });
    }

    if (network === "reddit") {
      const sr = targetId;
      if (!sr) return NextResponse.json({ ok: false, error: "missing_subreddit" }, { status: 409 });
      const title = String(trimmed.split("\n").find((l) => String(l || "").trim()) || "Análisis cívico").slice(0, 280);
      const form = new URLSearchParams({ sr: String(sr), kind: "self", title, text: trimmed });
      const r = await fetch("https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": String(process.env.MP26_REDDIT_USER_AGENT || "mp26/1.0 (oauth bridge)"),
        },
        body: form.toString(),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return NextResponse.json({ ok: false, error: "upstream_error", response: j }, { status: 502 });
      return NextResponse.json({ ok: true, status: "published", response: j });
    }

    return NextResponse.json({ ok: false, error: "unsupported_network" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "exception" }, { status: 500 });
  }
}

