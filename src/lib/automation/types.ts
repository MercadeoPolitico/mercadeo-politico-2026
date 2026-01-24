export type ContentType = "proposal" | "blog" | "social";

export type GenerateRequest = {
  candidate_id: string;
  content_type: ContentType;
  topic: string;
  tone?: string;
};

export type GenerateResponse = {
  generated_text: string;
  content_type: ContentType;
  candidate_id: string;
  token_estimate: number;
  created_at: string;
  /**
   * Optional variants (Phase 2.2).
   * Stored server-side and editable by admin before approval/automation.
   */
  variants?: {
    facebook: string;
    instagram: string;
    threads: string;
    x: string;
    telegram: string;
    reddit: string;
  };
  /**
   * Optional image keywords suggestion (text only).
   */
  image_keywords?: string[];
};

export type SubmitToN8nRequest = GenerateResponse & {
  source: "web";
  metadata?: Record<string, unknown>;
  /**
   * Preferred canonical payload for n8n:
   * - n8n should publish using draft.variants[network]
   * - keep root-level fields for backward compatibility
   */
  draft?: {
    id?: string | null;
    candidate_id: string;
    generated_text: string;
    variants: GenerateResponse["variants"];
  };
};

