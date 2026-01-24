import "server-only";

export type OpenAiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "disabled" | "not_configured" | "bad_response" | "upstream_error";
      meta?: {
        attempts: Array<{ provider: string; host: string | null; ok: boolean; status: number | null; failure: string | null }>;
      };
    };

type Provider = {
  name: "openai" | "openrouter" | "groq" | "cerebras";
  baseUrl: string;
  apiKey: string;
  model: string;
};

function normalizeBaseUrl(raw: string): string {
  const base = (raw || "").trim().replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

function normalizeSecret(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Fix accidental trailing literal \n in copied secrets (common).
  return s.endsWith("\\n") ? s.slice(0, -2).trim() : s;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function providers(): Provider[] {
  const list: Provider[] = [];

  const openAiKey = normalizeSecret(process.env.OPENAI_API_KEY);
  if (openAiKey) {
    list.push({
      name: "openai",
      baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com"),
      apiKey: openAiKey,
      model: (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim(),
    });
  }

  const openRouterKey = normalizeSecret(process.env.OPENROUTER_API_KEY);
  const openRouterModel = (process.env.OPENROUTER_MODEL ?? "").trim();
  if (openRouterKey && openRouterModel) {
    list.push({
      name: "openrouter",
      baseUrl: normalizeBaseUrl(process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api"),
      apiKey: openRouterKey,
      model: openRouterModel,
    });
  }

  const groqKey = normalizeSecret(process.env.GROQ_API_KEY);
  const groqModel = (process.env.GROQ_MODEL ?? "").trim();
  if (groqKey && groqModel) {
    list.push({
      name: "groq",
      baseUrl: normalizeBaseUrl(process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai"),
      apiKey: groqKey,
      model: groqModel,
    });
  }

  const cerebrasKey = normalizeSecret(process.env.CEREBRAS_API_KEY);
  const cerebrasModel = (process.env.CEREBRAS_MODEL ?? "").trim();
  if (cerebrasKey && cerebrasModel) {
    list.push({
      name: "cerebras",
      baseUrl: normalizeBaseUrl(process.env.CEREBRAS_BASE_URL?.trim() || "https://api.cerebras.ai"),
      apiKey: cerebrasKey,
      model: cerebrasModel,
    });
  }

  return list;
}

function isEnabled(): boolean {
  // Continuity-first:
  // - If OPENAI_ENABLED="false" => disabled.
  // - If OPENAI_ENABLED="true"  => enabled.
  // - If OPENAI_ENABLED is unset but OPENAI_API_KEY exists => enabled (common Vercel setup).
  const flag = process.env.OPENAI_ENABLED;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return providers().length > 0;
}

function hasConfig(): boolean {
  return providers().length > 0;
}

async function postJson(
  p: Provider,
  path: string,
  body: unknown,
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number | null; failure: string }> {
  try {
    const resp = await fetch(`${p.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const status = resp.status;
    if (!resp.ok) return { ok: false, status, failure: "http_error" };
    const data = (await resp.json().catch(() => null)) as unknown;
    if (!data) return { ok: false, status, failure: "bad_json" };
    return { ok: true, status, data };
  } catch {
    return { ok: false, status: null, failure: "network_error" };
  }
}

function pickTextCompletion(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const choices = Array.isArray(d.choices) ? (d.choices as unknown[]) : [];
  const c0 = choices[0];
  if (!c0 || typeof c0 !== "object") return "";
  const msg = (c0 as any).message;
  const content = typeof msg?.content === "string" ? msg.content : "";
  return content.trim();
}

function tryParseJsonObject<T>(text: string): T | null {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    // Common provider behavior: wrap JSON with extra text or markdown fences.
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function openAiJson<T>(args: { task: string; system: string; user: string }): Promise<OpenAiResult<T>> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  const ps = providers();
  if (!ps.length) return { ok: false, error: "not_configured" };

  const attempts: Array<{ provider: string; host: string | null; ok: boolean; status: number | null; failure: string | null }> = [];

  for (const p of ps) {
    const payload: Record<string, unknown> = {
      model: p.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    };
    // Ask for JSON output when supported (OpenAI). Some OpenAI-compatible providers reject this field.
    if (p.name === "openai") payload.response_format = { type: "json_object" };

    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await postJson(p, "/v1/chat/completions", payload);
      if (!r.ok) {
        attempts.push({ provider: p.name, host: hostOf(p.baseUrl), ok: false, status: r.status, failure: r.failure });
        continue;
      }
      attempts.push({ provider: p.name, host: hostOf(p.baseUrl), ok: true, status: r.status, failure: null });

      const text = pickTextCompletion(r.data);
      if (!text) continue;
      const parsed = tryParseJsonObject<T>(text);
      if (parsed) return { ok: true, data: parsed };
      // provider returned non-JSON; try next
      continue;
    } catch {
      // try next provider
      continue;
    }
  }

  return { ok: false, error: "upstream_error", meta: { attempts } };
}

