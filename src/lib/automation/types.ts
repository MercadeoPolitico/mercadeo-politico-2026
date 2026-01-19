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
};

export type SubmitToN8nRequest = GenerateResponse & {
  source: "web";
  metadata?: Record<string, unknown>;
};

