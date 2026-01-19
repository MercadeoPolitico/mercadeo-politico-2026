import type { ContentType } from "./types";

export const MAX_BODY_BYTES = 8_000; // hard cap on request size

export const MAX_TOPIC_CHARS = 160;
export const MAX_TONE_CHARS = 80;
export const MAX_CANDIDATE_ID_CHARS = 64;

export function maxOutputCharsFor(contentType: ContentType): number {
  switch (contentType) {
    case "proposal":
      return 1_600; // short section blocks
    case "blog":
      return 2_000; // outline / summary, not a full article
    case "social":
      return 420; // single post (with room for punctuation)
  }
}

export function maxPromptCharsFor(contentType: ContentType): number {
  // Keep prompts short to minimize credits.
  switch (contentType) {
    case "proposal":
      return 1_200;
    case "blog":
      return 1_400;
    case "social":
      return 900;
  }
}

export function estimateTokens(text: string): number {
  // Conservative heuristic: ~4 chars/token for Spanish/English mixed.
  return Math.max(1, Math.ceil(text.length / 4));
}

