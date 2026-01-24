import type { ContentType, GenerateRequest, SubmitToN8nRequest } from "./types";
import { MAX_CANDIDATE_ID_CHARS, MAX_TONE_CHARS, MAX_TOPIC_CHARS } from "./limits";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isContentType(v: unknown): v is ContentType {
  return v === "proposal" || v === "blog" || v === "social";
}

export function validateGenerateRequest(input: unknown): { ok: true; data: GenerateRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid JSON body." };
  const obj = input as Record<string, unknown>;

  if (!isNonEmptyString(obj.candidate_id)) return { ok: false, error: "candidate_id is required." };
  const candidate_id = obj.candidate_id.trim();
  if (candidate_id.length > MAX_CANDIDATE_ID_CHARS) return { ok: false, error: "candidate_id too long." };

  if (!isContentType(obj.content_type)) return { ok: false, error: "content_type must be one of: proposal, blog, social." };
  const content_type = obj.content_type;

  if (!isNonEmptyString(obj.topic)) return { ok: false, error: "topic is required." };
  const topic = obj.topic.trim();
  if (topic.length > MAX_TOPIC_CHARS) return { ok: false, error: "topic too long." };

  let tone: string | undefined;
  if (obj.tone !== undefined) {
    if (!isNonEmptyString(obj.tone)) return { ok: false, error: "tone must be a non-empty string when provided." };
    tone = obj.tone.trim();
    if (tone.length > MAX_TONE_CHARS) return { ok: false, error: "tone too long." };
  }

  return { ok: true, data: { candidate_id, content_type, topic, tone } };
}

export function validateSubmitToN8nRequest(
  input: unknown,
): { ok: true; data: SubmitToN8nRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid JSON body." };
  const obj = input as Record<string, unknown>;

  if (!isNonEmptyString(obj.candidate_id)) return { ok: false, error: "candidate_id is required." };
  if (!isContentType(obj.content_type)) return { ok: false, error: "content_type invalid." };
  if (!isNonEmptyString(obj.generated_text)) return { ok: false, error: "generated_text is required." };
  if (!isNonEmptyString(obj.created_at)) return { ok: false, error: "created_at is required." };
  if (obj.source !== "web") return { ok: false, error: "source must be 'web'." };

  const token_estimate = typeof obj.token_estimate === "number" && Number.isFinite(obj.token_estimate) ? obj.token_estimate : 0;
  const metadata = typeof obj.metadata === "object" && obj.metadata !== null ? (obj.metadata as Record<string, unknown>) : undefined;

  // Optional draft envelope (preferred by n8n), validated softly for compatibility.
  const draft =
    obj.draft && typeof obj.draft === "object"
      ? (() => {
          const d = obj.draft as Record<string, unknown>;
          if (!isNonEmptyString(d.candidate_id)) return undefined;
          if (!isNonEmptyString(d.generated_text)) return undefined;
          const v = d.variants && typeof d.variants === "object" ? (d.variants as Record<string, unknown>) : null;
          const hasAll =
            v &&
            typeof v.facebook === "string" &&
            typeof v.instagram === "string" &&
            typeof v.threads === "string" &&
            typeof v.x === "string" &&
            typeof v.telegram === "string" &&
            typeof v.reddit === "string";
          if (!hasAll) return undefined;
          return {
            id: typeof d.id === "string" ? d.id : d.id === null ? null : undefined,
            candidate_id: String(d.candidate_id),
            generated_text: String(d.generated_text),
            variants: {
              facebook: String(v.facebook),
              instagram: String(v.instagram),
              threads: String(v.threads),
              x: String(v.x),
              telegram: String(v.telegram),
              reddit: String(v.reddit),
            },
          } as SubmitToN8nRequest["draft"];
        })()
      : undefined;

  return {
    ok: true,
    data: {
      candidate_id: String(obj.candidate_id),
      content_type: obj.content_type,
      generated_text: String(obj.generated_text),
      created_at: String(obj.created_at),
      token_estimate,
      source: "web",
      metadata,
      ...(draft ? { draft } : {}),
    },
  };
}

