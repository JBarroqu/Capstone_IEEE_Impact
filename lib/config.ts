/** auto: every available model (Gemini, then Groq/OpenRouter if keyed, then local Ollama). gemini/ollama: only that service. */
export type ProviderName = "auto" | "ollama" | "gemini";

const env = (k: string, d = "") => process.env[k] ?? d;

export const config = {
  provider: (["auto", "ollama", "gemini"].includes(env("MOVE_PROVIDER")) ? env("MOVE_PROVIDER") : "auto") as ProviderName,
  geminiKey: env("GEMINI_API_KEY"),
  /** Optional comma list to pin Gemini models in order; empty = discover from the API. */
  geminiModels: env("GEMINI_MODELS"),
  geminiMaxModels: Number(env("GEMINI_MAX_MODELS", "10")),
  geminiRpm: Number(env("GEMINI_RPM", "9")),
  ollamaUrl: env("OLLAMA_URL", "http://localhost:11434"),
  ollamaModel: env("OLLAMA_MODEL", "llama3.1:8b"),
  /** Per model call. Short-ish because a slow model is skipped for the next one in the chain. */
  llmTimeoutMs: Number(env("LLM_TIMEOUT_MS", "12000")),
  /** Whole request across every model tried before the student sees a retry prompt. */
  llmBudgetMs: Number(env("LLM_BUDGET_MS", "60000")),
  /** Classification runs while the student fills in the next screen; keyword matching answers if this runs out. */
  classifyBudgetMs: Number(env("CLASSIFY_BUDGET_MS", "20000")),
  /** The student waits on a loading state for the follow-up questions; the fixed quiz is shown if this runs out. */
  questionsBudgetMs: Number(env("QUESTIONS_BUDGET_MS", "20000")),
  shufflePositions: env("SHUFFLE_POSITIONS") === "true",
  /** 1 = quick survey: pick one move, then rate it. 3 = full path (moves 1-3, optionally up to 5). */
  flowMoves: (env("FLOW_MOVES", "1") === "3" ? 3 : 1) as 1 | 3,
  adminPassword: env("ADMIN_PASSWORD"),
  appVersion: "0.1.0",
};

/** Consent copy; edit freely. Chosen by the provider in use. */
export const consentCopy = {
  intro:
    "This is a prototype. It suggests first moves for something you want to make happen. Your choices and feedback are saved under the name you enter below, so the researcher can tell participants apart. Please don't type other personal details (like contact info) into any text field.",
  remote: (services: string[]) =>
    `What you type in the wish, why, and prior-attempts fields is sent to an outside model service (${services.join(", ")}) to generate options, and may be reviewed by that service. Your name is not sent.`,
  local: "Nothing you type leaves this test machine.",
};
