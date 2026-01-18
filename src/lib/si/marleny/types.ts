export type MarlenyRequest = {
  /**
   * Stable identifier for the task/workflow (e.g. "content_draft", "risk_review").
   * Keep this boring and deterministic.
   */
  task: string;
  /**
   * Correlation ID for tracing across systems (n8n → Marleny → app).
   * Should be provided by automation, not by the browser.
   */
  correlationId?: string;
  /**
   * Input payload (content, metadata, context). This is intentionally generic because
   * Marleny is treated as a black-box synthetic intelligence.
   */
  input: Record<string, unknown>;
};

export type MarlenyResponse = {
  correlationId?: string;
  /**
   * Output payload (recommendations, structured drafts, compliance flags, etc.)
   */
  output: Record<string, unknown>;
};

