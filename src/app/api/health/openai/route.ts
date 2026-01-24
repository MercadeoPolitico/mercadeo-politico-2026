import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function normalizeSecret(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const base = String(raw ?? fallback).trim().replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

async function probeChatCompletion(args: { baseUrl: string; apiKey: string; model: string }): Promise<{ ok: boolean; status: number | null; failure: string | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(`${args.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.apiKey}` },
      body: JSON.stringify({
        model: args.model,
        temperature: 0,
        messages: [{ role: "user", content: "ping" }],
        response_format: { type: "json_object" },
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { ok: resp.ok, status: resp.status, failure: resp.ok ? null : "http_error" };
  } catch (e: any) {
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "AbortError") return { ok: false, status: null, failure: "timeout" };
    return { ok: false, status: null, failure: "network_error" };
  }
}

export async function GET(req: Request) {
  const flag = process.env.OPENAI_ENABLED;
  const enabled = flag === "false" ? false : flag === "true" ? true : Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length);
  const configured = enabled && Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length);

  const url = new URL(req.url);
  const wantProbe = url.searchParams.get("probe") === "true";

  const tokenHeader = normalizeToken(req.headers.get("x-automation-token") ?? "");
  const tokenEnv = normalizeToken(process.env.MP26_AUTOMATION_TOKEN ?? process.env.AUTOMATION_API_TOKEN);
  const allowProbe = wantProbe && tokenEnv && tokenHeader === tokenEnv;

  let probe: { ok: true; results: any[] } | null = null;
  if (allowProbe) {
    const results: any[] = [];

    const openAiKey = normalizeSecret(process.env.OPENAI_API_KEY);
    if (openAiKey) {
      results.push({
        provider: "openai",
        host: hostOf(process.env.OPENAI_BASE_URL ?? "https://api.openai.com"),
        ...(await probeChatCompletion({
          baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com"),
          apiKey: openAiKey,
          model: (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim(),
        })),
      });
    }

    const openRouterKey = normalizeSecret(process.env.OPENROUTER_API_KEY);
    const openRouterModel = (process.env.OPENROUTER_MODEL ?? "").trim();
    if (openRouterKey && openRouterModel) {
      results.push({
        provider: "openrouter",
        host: hostOf(process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api"),
        ...(await probeChatCompletion({
          baseUrl: normalizeBaseUrl(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api"),
          apiKey: openRouterKey,
          model: openRouterModel,
        })),
      });
    }

    const groqKey = normalizeSecret(process.env.GROQ_API_KEY);
    const groqModel = (process.env.GROQ_MODEL ?? "").trim();
    if (groqKey && groqModel) {
      results.push({
        provider: "groq",
        host: hostOf(process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai"),
        ...(await probeChatCompletion({
          baseUrl: normalizeBaseUrl(process.env.GROQ_BASE_URL, "https://api.groq.com/openai"),
          apiKey: groqKey,
          model: groqModel,
        })),
      });
    }

    const cerebrasKey = normalizeSecret(process.env.CEREBRAS_API_KEY);
    const cerebrasModel = (process.env.CEREBRAS_MODEL ?? "").trim();
    if (cerebrasKey && cerebrasModel) {
      results.push({
        provider: "cerebras",
        host: hostOf(process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai"),
        ...(await probeChatCompletion({
          baseUrl: normalizeBaseUrl(process.env.CEREBRAS_BASE_URL, "https://api.cerebras.ai"),
          apiKey: cerebrasKey,
          model: cerebrasModel,
        })),
      });
    }

    probe = { ok: true, results };
  }

  return NextResponse.json({
    ok: true,
    openai: {
      enabled,
      configured,
      base_url_host: hostOf(process.env.OPENAI_BASE_URL ?? "https://api.openai.com"),
      model: process.env.OPENAI_MODEL ? String(process.env.OPENAI_MODEL) : null,
    },
    ...(probe ? { probe } : {}),
  });
}

