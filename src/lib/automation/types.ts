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
    x: string;
  };
  /**
   * Optional image keywords suggestion (text only).
   */
  image_keywords?: string[];
};

export type SubmitToN8nRequest = GenerateResponse & {
  source: "web";
  metadata?: Record<string, unknown>;
};

