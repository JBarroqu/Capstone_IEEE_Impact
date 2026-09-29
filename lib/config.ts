export type ProviderName = "static" | "ollama" | "gemini";

const env = (k: string, d = "") => process.env[k] ?? d;

export const config = {
  provider: env("MOVE_PROVIDER", "gemini") as ProviderName,
  geminiKey: env("GEMINI_API_KEY"),
  geminiModel: env("GEMINI_MODEL", "gemini-3.1-flash-lite"),
  ollamaUrl: env("OLLAMA_URL", "http://localhost:11434"),
  ollamaModel: env("OLLAMA_MODEL", "llama3.1:8b"),
  llmTimeoutMs: Number(env("LLM_TIMEOUT_MS", "12000")),
  llmCache: env("LLM_CACHE", "true") !== "false",
  shufflePositions: env("SHUFFLE_POSITIONS") === "true",
  adminPassword: env("ADMIN_PASSWORD"),
  appVersion: "0.1.0",
};

/** Consent copy; edit freely. Chosen by the provider in use. */
export const consentCopy = {
  intro:
    "This is a prototype. It suggests first moves for something you want to make happen. Your choices and feedback are saved under the name you enter below, so the researcher can tell participants apart. Please don't type other personal details (like contact info) into any text field.",
  gemini:
    "What you type in the wish, why, and prior-attempts fields is sent to Google's Gemini service to generate options, and may be reviewed by Google. Your name is not sent.",
  local: "Nothing you type leaves this test machine.",
};
