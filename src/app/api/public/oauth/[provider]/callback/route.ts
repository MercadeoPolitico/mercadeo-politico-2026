import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrlString } from "@/lib/site";
import { oauthClientConfig, isOAuthProvider, type OAuthProvider } from "@/lib/oauth/providers";
import { decryptSecret, encryptSecret, sha256Hex } from "@/lib/oauth/crypto";

export const runtime = "nodejs";

function callbackUrl(provider: OAuthProvider): string {
  return `${getSiteUrlString()}/api/public/oauth/${provider}/callback`;
}

function doneUrl(params: { ok: boolean; provider: OAuthProvider; candidateId?: string; count?: number; error?: string }): string {
  const u = new URL(`${getSiteUrlString()}/connect/done`);
  u.searchParams.set("provider", params.provider);
  u.searchParams.set("ok", params.ok ? "1" : "0");
  if (params.candidateId) u.searchParams.set("candidate_id", params.candidateId);
  if (typeof params.count === "number") u.searchParams.set("count", String(params.count));
  if (params.error) u.searchParams.set("error", params.error);
  return u.toString();
}

async function exchangeMetaCode(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const u = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("client_secret", clientSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error("meta_token_exchange_failed");
  return {
    access_token: String(j.access_token),
    expires_in: typeof j.expires_in === "number" ? j.expires_in : null,
  };
}

async function metaPages(accessToken: string) {
  const u = new URL("https://graph.facebook.com/v19.0/me/accounts");
  u.searchParams.set("access_token", accessToken);
  const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("meta_pages_failed");
  const data = Array.isArray(j?.data) ? j.data : [];
  return data.map((p: any) => ({
    id: String(p?.id ?? ""),
    name: String(p?.name ?? ""),
    page_access_token: p?.access_token ? String(p.access_token) : null,
  })).filter((x: any) => x.id);
}

async function metaPageInstagramAccount(args: { pageId: string; accessToken: string }) {
  const u = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(args.pageId)}`);
  u.searchParams.set("fields", "instagram_business_account,connected_instagram_account");
  u.searchParams.set("access_token", args.accessToken);
  const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) return { ig_user_id: null as string | null };
  const ig =
    (j?.instagram_business_account?.id ? String(j.instagram_business_account.id) : null) ??
    (j?.connected_instagram_account?.id ? String(j.connected_instagram_account.id) : null);
  return { ig_user_id: ig && ig.trim() ? ig.trim() : null };
}

async function metaInstagramProfile(args: { igUserId: string; accessToken: string }) {
  const u = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(args.igUserId)}`);
  u.searchParams.set("fields", "username,name");
  u.searchParams.set("access_token", args.accessToken);
  const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) return { username: null as string | null, name: null as string | null };
  const username = typeof j?.username === "string" ? j.username.trim() : "";
  const name = typeof j?.name === "string" ? j.name.trim() : "";
  return { username: username || null, name: name || null };
}

async function exchangeRedditCode(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  const auth = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const r = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error("reddit_token_exchange_failed");
  return {
    access_token: String(j.access_token),
    refresh_token: j.refresh_token ? String(j.refresh_token) : null,
    expires_in: typeof j.expires_in === "number" ? j.expires_in : null,
    scope: typeof j.scope === "string" ? j.scope : null,
  };
}

async function redditMe(accessToken: string) {
  const r = await fetch("https://oauth.reddit.com/api/v1/me", {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}`, "user-agent": "mp26/1.0 (oauth connect)" },
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("reddit_me_failed");
  return { id: String(j?.id ?? ""), name: String(j?.name ?? "") };
}

async function exchangeXCode(code: string, redirectUri: string, clientId: string, clientSecret: string, codeVerifier: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("code_verifier", codeVerifier);
  const auth = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const r = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error("x_token_exchange_failed");
  return {
    access_token: String(j.access_token),
    refresh_token: j.refresh_token ? String(j.refresh_token) : null,
    expires_in: typeof j.expires_in === "number" ? j.expires_in : null,
    scope: typeof j.scope === "string" ? j.scope : null,
  };
}

async function xMe(accessToken: string) {
  const r = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("x_me_failed");
  const data = j?.data ?? null;
  return { id: String(data?.id ?? ""), username: String(data?.username ?? "") };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ ok: false, error: "invalid_provider" }, { status: 400 });
  const provider = rawProvider as OAuthProvider;

  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim();
  const state = String(url.searchParams.get("state") ?? "").trim();
  const err = String(url.searchParams.get("error") ?? "").trim();

  if (err) return NextResponse.redirect(doneUrl({ ok: false, provider, error: `oauth_error:${err}` }));
  if (!code || !state) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "missing_code_or_state" }));

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "not_configured" }));

  const stateHash = sha256Hex(state);
  const { data: st } = await admin
    .from("social_oauth_states")
    .select("id,provider,candidate_id,expires_at,used_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!st || String(st.provider) !== provider) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "invalid_state" }));
  if (st.used_at) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "state_already_used", candidateId: String(st.candidate_id) }));
  if (Date.parse(String(st.expires_at)) <= Date.now()) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "state_expired", candidateId: String(st.candidate_id) }));

  // Mark used early to prevent replay.
  await admin.from("social_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", st.id);

  const cfg = oauthClientConfig(provider);
  if (!cfg.configured) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "provider_not_configured", candidateId: String(st.candidate_id) }));

  try {
    const redirectUri = callbackUrl(provider);
    const nowIso = new Date().toISOString();

    if (provider === "meta") {
      const tok = await exchangeMetaCode(code, redirectUri, cfg.clientId, cfg.clientSecret);
      const pages = await metaPages(tok.access_token);
      const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;

      let upserts = 0;
      for (const p of pages) {
        const tokenToStore = p.page_access_token || tok.access_token;
        const { error: upErr } = await admin.from("social_oauth_connections").upsert(
          {
            provider: "meta",
            candidate_id: String(st.candidate_id),
            external_id: p.id,
            external_username: null,
            display_name: p.name || null,
            access_token_enc: encryptSecret(tokenToStore),
            refresh_token_enc: null,
            expires_at: expiresAt,
            scopes: "pages_show_list",
            status: "active",
            updated_at: nowIso,
          },
          { onConflict: "provider,candidate_id,external_id" },
        );
        if (!upErr) upserts++;

        // Auto-register a destination for n8n routing (no secrets; token stays encrypted in Supabase).
        const pageUrl = `https://facebook.com/${p.id}`;
        const { data: existingDest } = await admin
          .from("politician_social_destinations")
          .select("id")
          .eq("politician_id", String(st.candidate_id))
          .eq("profile_or_page_url", pageUrl)
          .maybeSingle();
        const destPayload = {
          politician_id: String(st.candidate_id),
          network_name: `Facebook Page (OAuth): ${p.name || p.id}`,
          network_key: "facebook",
          scope: "page",
          target_id: p.id,
          credential_ref: "oauth:meta",
          network_type: "official",
          profile_or_page_url: pageUrl,
          owner_name: null,
          owner_contact_phone: null,
          owner_contact_email: null,
          active: true,
          authorization_status: "approved",
          authorized_at: nowIso,
          revoked_at: null,
          updated_at: nowIso,
        };
        if (existingDest?.id) await admin.from("politician_social_destinations").update(destPayload).eq("id", existingDest.id);
        else await admin.from("politician_social_destinations").insert(destPayload);

        // Also register Instagram Business (if page is connected).
        try {
          const { ig_user_id } = await metaPageInstagramAccount({ pageId: p.id, accessToken: tokenToStore });
          if (ig_user_id) {
            const igProfile = await metaInstagramProfile({ igUserId: ig_user_id, accessToken: tokenToStore });
            const igUsername = igProfile.username;
            const igName = igProfile.name ?? igUsername ?? ig_user_id;

            await admin.from("social_oauth_connections").upsert(
              {
                provider: "meta",
                candidate_id: String(st.candidate_id),
                external_id: ig_user_id,
                external_username: igUsername || null,
                display_name: igName || null,
                access_token_enc: encryptSecret(tokenToStore),
                refresh_token_enc: null,
                expires_at: expiresAt,
                scopes: "instagram_basic instagram_content_publish",
                status: "active",
                updated_at: nowIso,
              },
              { onConflict: "provider,candidate_id,external_id" },
            );

            const igUrl = igUsername ? `https://instagram.com/${igUsername}` : `https://instagram.com`;
            const { data: existingIgDest } = await admin
              .from("politician_social_destinations")
              .select("id")
              .eq("politician_id", String(st.candidate_id))
              .eq("profile_or_page_url", igUrl)
              .maybeSingle();

            const igDestPayload = {
              politician_id: String(st.candidate_id),
              network_name: `Instagram Business (OAuth): ${igUsername ? `@${igUsername}` : ig_user_id}`,
              network_key: "instagram",
              scope: "profile",
              target_id: ig_user_id,
              credential_ref: "oauth:meta",
              network_type: "official",
              profile_or_page_url: igUrl,
              owner_name: null,
              owner_contact_phone: null,
              owner_contact_email: null,
              active: true,
              authorization_status: "approved",
              authorized_at: nowIso,
              revoked_at: null,
              updated_at: nowIso,
            };
            if (existingIgDest?.id) await admin.from("politician_social_destinations").update(igDestPayload).eq("id", existingIgDest.id);
            else await admin.from("politician_social_destinations").insert(igDestPayload);
          }
        } catch {
          // ignore IG discovery (best-effort)
        }
      }

      return NextResponse.redirect(doneUrl({ ok: true, provider, candidateId: String(st.candidate_id), count: upserts }));
    }

    if (provider === "reddit") {
      const tok = await exchangeRedditCode(code, redirectUri, cfg.clientId, cfg.clientSecret);
      const me = await redditMe(tok.access_token);
      const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;

      await admin.from("social_oauth_connections").upsert(
        {
          provider: "reddit",
          candidate_id: String(st.candidate_id),
          external_id: me.id || me.name || "reddit",
          external_username: me.name || null,
          display_name: me.name || null,
          access_token_enc: encryptSecret(tok.access_token),
          refresh_token_enc: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
          expires_at: expiresAt,
          scopes: tok.scope,
          status: "active",
          updated_at: nowIso,
        },
        { onConflict: "provider,candidate_id,external_id" },
      );

      return NextResponse.redirect(doneUrl({ ok: true, provider, candidateId: String(st.candidate_id), count: 1 }));
    }

    // provider === "x"
    const cookieName = `mp26_pkce_${stateHash}`;
    const cookieVal = decodeURIComponent(String(req.cookies.get(cookieName)?.value ?? ""));
    const verifier = cookieVal ? decryptSecret(cookieVal) : "";
    if (!verifier) return NextResponse.redirect(doneUrl({ ok: false, provider, error: "missing_pkce_verifier", candidateId: String(st.candidate_id) }));

    const tok = await exchangeXCode(code, redirectUri, cfg.clientId, cfg.clientSecret, verifier);
    const me = await xMe(tok.access_token);
    const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;

    await admin.from("social_oauth_connections").upsert(
      {
        provider: "x",
        candidate_id: String(st.candidate_id),
        external_id: me.id || "x",
        external_username: me.username || null,
        display_name: me.username ? `@${me.username}` : null,
        access_token_enc: encryptSecret(tok.access_token),
        refresh_token_enc: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
        expires_at: expiresAt,
        scopes: tok.scope,
        status: "active",
        updated_at: nowIso,
      },
      { onConflict: "provider,candidate_id,external_id" },
    );

    // Auto-register destination (publishes to the connected account).
    const xUrl = me.username ? `https://x.com/${me.username}` : `https://x.com`;
    const { data: existingXDest } = await admin
      .from("politician_social_destinations")
      .select("id")
      .eq("politician_id", String(st.candidate_id))
      .eq("profile_or_page_url", xUrl)
      .maybeSingle();
    const xPayload = {
      politician_id: String(st.candidate_id),
      network_name: `X (OAuth): ${me.username ? `@${me.username}` : me.id}`,
      network_key: "x",
      scope: "profile",
      target_id: me.id || null,
      credential_ref: "oauth:x",
      network_type: "official",
      profile_or_page_url: xUrl,
      owner_name: null,
      owner_contact_phone: null,
      owner_contact_email: null,
      active: true,
      authorization_status: "approved",
      authorized_at: nowIso,
      revoked_at: null,
      updated_at: nowIso,
    };
    if (existingXDest?.id) await admin.from("politician_social_destinations").update(xPayload).eq("id", existingXDest.id);
    else await admin.from("politician_social_destinations").insert(xPayload);

    const res = NextResponse.redirect(doneUrl({ ok: true, provider, candidateId: String(st.candidate_id), count: 1 }));
    res.cookies.set({ name: cookieName, value: "", maxAge: 0, path: `/api/public/oauth/x/callback` });
    return res;
  } catch (e) {
    const msg = typeof (e as any)?.message === "string" ? String((e as any).message) : "callback_failed";
    return NextResponse.redirect(doneUrl({ ok: false, provider, error: msg, candidateId: String(st.candidate_id) }));
  }
}

