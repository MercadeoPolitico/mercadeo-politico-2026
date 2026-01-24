import "server-only";

export type OpenAiResult<T> = { ok: true; data: T } | { ok: false; error: "disabled" | "not_configured" | "bad_response" | "upstream_error" };

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

function providers(): Provider[] {
  const list: Provider[] = [];

  const openAiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openAiKey) {
    list.push({
      name: "openai",
      baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com"),
      apiKey: openAiKey,
      model: (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim(),
    });
  }

  const openRouterKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const openRouterModel = (process.env.OPENROUTER_MODEL ?? "").trim();
  if (openRouterKey && openRouterModel) {
    list.push({
      name: "openrouter",
      baseUrl: normalizeBaseUrl(process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api"),
      apiKey: openRouterKey,
      model: openRouterModel,
    });
  }

  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  const groqModel = (process.env.GROQ_MODEL ?? "").trim();
  if (groqKey && groqModel) {
    list.push({
      name: "groq",
      baseUrl: normalizeBaseUrl(process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai"),
      apiKey: groqKey,
      model: groqModel,
    });
  }

  const cerebrasKey = (process.env.CEREBRAS_API_KEY ?? "").trim();
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

async function postJson(p: Provider, path: string, body: unknown): Promise<unknown> {
  const resp = await fetch(`${p.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!resp.ok) throw new Error("upstream");
  return (await resp.json()) as unknown;
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

export async function openAiJson<T>(args: { task: string; system: string; user: string }): Promise<OpenAiResult<T>> {
  if (!isEnabled()) return { ok: false, error: "disabled" };
  if (!hasConfig()) return { ok: false, error: "not_configured" };

  const ps = providers();
  if (!ps.length) return { ok: false, error: "not_configured" };

  for (const p of ps) {
    const payload = {
      model: p.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      // Ask for JSON output, but remain compatible with providers that ignore this.
      response_format: { type: "json_object" },
    };

    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await postJson(p, "/v1/chat/completions", payload);
      const text = pickTextCompletion(data);
      if (!text) continue;
      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        // provider returned non-JSON; try next
        continue;
      }
    } catch {
      // try next provider
      continue;
    }
  }

  return { ok: false, error: "upstream_error" };
}

