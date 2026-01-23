import "server-only";

export type OpenAiResult<T> = { ok: true; data: T } | { ok: false; error: "disabled" | "not_configured" | "bad_response" | "upstream_error" };

function isEnabled(): boolean {
  // Continuity-first:
  // - If OPENAI_ENABLED="false" => disabled.
  // - If OPENAI_ENABLED="true"  => enabled.
  // - If OPENAI_ENABLED is unset but OPENAI_API_KEY exists => enabled (common Vercel setup).
  const flag = process.env.OPENAI_ENABLED;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length);
}

function hasConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function baseUrl(): string {
  // Allow override (self-hosted gateway), default OpenAI API.
  return (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com").replace(/\/+$/, "");
}

function model(): string {
  return (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").trim();
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const resp = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
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

  const payload = {
    model: model(),
    temperature: 0.2,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    // Ask for JSON output, but remain compatible with providers that ignore this.
    response_format: { type: "json_object" },
  };

  try {
    const data = await postJson("/v1/chat/completions", payload);
    const text = pickTextCompletion(data);
    if (!text) return { ok: false, error: "bad_response" };
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: "bad_response" };
    }
  } catch {
    return { ok: false, error: "upstream_error" };
  }
}

