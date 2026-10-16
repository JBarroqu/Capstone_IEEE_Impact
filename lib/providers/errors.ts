import type { OptionsResult } from "../types";

export class RateLimited extends Error {}
export class Timeout extends Error {}

export type FailReason = NonNullable<OptionsResult["meta"]["fallbackReason"]>;

/** No backend could produce a valid answer within the time budget. Static moves are NOT substituted unless LLM_FALLBACK=static. */
export class LlmUnavailable extends Error {
  constructor(public reason: FailReason, public detail?: string) {
    super(`LLM unavailable (${reason})${detail ? `: ${detail}` : ""}`);
  }
}
