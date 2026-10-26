export const FOCUSES = ["learn", "goal", "system", "advance", "lead", "connect"] as const;
export const DOMAINS = ["career", "academic", "technical", "venture", "leadership"] as const;
export const ARCHETYPES = ["builder", "connector", "planner", "explorer"] as const;
export const FORMATS = ["solo", "peer", "group", "mentor", "course", "project", "event"] as const;

export type Focus = (typeof FOCUSES)[number];
export type Domain = (typeof DOMAINS)[number];
export type Archetype = (typeof ARCHETYPES)[number];
export type Format = (typeof FORMATS)[number];
export type WishType = "open_ended" | "fixed";
export type Step = 1 | 2 | 3 | 4 | 5;

export const DOMAIN_LABEL: Record<Domain, string> = {
  career: "Career & Industry",
  academic: "Academic Foundation",
  technical: "Technical Mastery",
  venture: "Venture & Impact",
  leadership: "Leadership & Network",
};
export const FOCUS_LABEL: Record<Focus, string> = {
  learn: "Learn", goal: "Goal", system: "System", advance: "Advance", lead: "Lead", connect: "Connect",
};

export type Move = {
  id: string;
  title: string;
  detail: string;
  step: Step;
  focus: Focus[];
  domains: Domain[];
  minutes: number;
  cost: "free" | "paid";
  format: Format;
  archetypeFit: Partial<Record<Archetype, number>>;
  tier?: number;
  requires?: string[];
};

export type PriorAttempts = { chips: string[]; text?: string };

/** One answered follow-up question; `note` is what the question was meant to find out (never shown to the student). */
export type FollowUp = { question: string; answer: string; note?: string };

export type Question = { id: string; prompt: string; answers: { id: string; label: string }[]; note: string };

/**
 * The follow-up questions shown after "A bit of context". "llm": written for this wish by the model chain.
 * "fixed": the placeholder archetype quiz, used only when every model failed.
 */
export type QuestionSet = {
  source: "llm" | "fixed";
  questions: Question[];
  provider?: string; model?: string; promptVersion?: string; latencyMs: number; tried?: string[]; failReason?: string;
};

/** What providers need to know about the student's wish. */
export type WishContext = {
  wishText: string;
  type: WishType;
  focus: Focus[];
  domains: Domain[];
  why?: string;
  prior: PriorAttempts;
  archetype?: Archetype;
  /** Answers to the generated follow-up questions (empty when skipped or when the fixed quiz was used). */
  followUps?: FollowUp[];
  /** Moves locked in at earlier steps, in order. */
  chosen: Move[];
};

export type RejectReason = { chip?: string; text?: string };

export type OptionsRequest = {
  ctx: WishContext;
  step: Step;
  excludeIds: string[];
  /** Titles already shown for this step, so the model does not repeat them on a reroll. */
  excludeTitles?: string[];
  rejectReason?: RejectReason;
  rejectedMoves?: Move[];
  rerollIndex: number;
  sessionId?: string;
  wishId?: string;
};

export type OptionsMeta = {
  requestedProvider: string;
  usedProvider: string;
  model?: string;
  promptVersion?: string;
  latencyMs: number;
  /** Always false since the cache was removed (moves.v3); kept for options_shown.cache_hit. */
  cacheHit: boolean;
  repaired: boolean;
  relaxed: boolean;
  /** Raw error text for debugging (llm:check); not logged to events. */
  errorDetail?: string;
  fallbackReason?: "timeout" | "invalid_json" | "rate_limited" | "error";
  /** Always "generated"; kept in options_shown so older rows (which could say "catalog") still read the same way. */
  sources: "generated"[];
  /** Models that failed before the one that answered, as "provider:model:reason". */
  tried?: string[];
};

export type OptionsResult = { moves: Move[]; meta: OptionsMeta };

export interface MoveProvider {
  name: "ollama" | "gemini" | "auto";
  getOptions(req: OptionsRequest): Promise<OptionsResult>;
}
