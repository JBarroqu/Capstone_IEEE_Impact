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

/** What providers need to know about the student's wish. */
export type WishContext = {
  wishText: string;
  type: WishType;
  focus: Focus[];
  domains: Domain[];
  why?: string;
  prior: PriorAttempts;
  archetype?: Archetype;
  /** Moves locked in at earlier steps, in order. */
  chosen: Move[];
};

export type RejectReason = { chip?: string; text?: string };

export type OptionsRequest = {
  ctx: WishContext;
  step: Step;
  excludeIds: string[];
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
  cacheHit: boolean;
  repaired: boolean;
  relaxed: boolean;
  /** Raw error text for debugging (llm:check); not logged to events. */
  errorDetail?: string;
  fallbackReason?: "timeout" | "invalid_json" | "rate_limited" | "error";
  sources: ("catalog" | "generated")[];
  /** Models that failed before the one that answered, as "provider:model:reason". */
  tried?: string[];
};

export type OptionsResult = { moves: Move[]; meta: OptionsMeta };

export interface MoveProvider {
  name: "static" | "ollama" | "gemini" | "auto";
  getOptions(req: OptionsRequest): Promise<OptionsResult>;
}
