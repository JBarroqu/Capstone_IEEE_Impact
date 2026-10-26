import type { Move, MoveProvider, OptionsRequest, OptionsResult } from "../types";
import { chainProvider } from "./llm";

/** Every provider is the model chain (see backends.ts); MOVE_PROVIDER only narrows which services it uses. */
export function getProvider(): MoveProvider {
  return chainProvider();
}

export type Store = {
  persistGenerated(req: OptionsRequest, moves: Move[], meta: OptionsResult["meta"]): Promise<void>;
};

export const dbStore: Store = {
  async persistGenerated(req, moves, meta) {
    if (!req.sessionId) return;
    const { getDb, schema } = await import("../db/client");
    await getDb().insert(schema.generatedMoves).values(
      moves.map((m) => ({
        id: m.id, sessionId: req.sessionId!, wishId: req.wishId ?? null, step: req.step,
        move: m as unknown as Record<string, unknown>, provider: meta.usedProvider, model: meta.model,
        promptVersion: meta.promptVersion,
      })),
    ).onConflictDoNothing();
  },
};

/**
 * Entry point used by the API. Every request goes to the model (no cache), so two students with the same wish get
 * their own options. Throws LlmUnavailable when the chain fails; the student then sees a retry.
 */
export async function getOptions(req: OptionsRequest, opts: { provider?: MoveProvider; store?: Store } = {}): Promise<OptionsResult> {
  const result = await (opts.provider ?? getProvider()).getOptions(req);
  (opts.store ?? dbStore).persistGenerated(req, result.moves, result.meta).catch(() => {});
  return result;
}
