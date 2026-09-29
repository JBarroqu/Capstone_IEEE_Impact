import { z } from "zod";

export const EVENT_NAMES = [
  "session_started", "consent_given", "wish_submitted", "classification_guessed", "classification_confirmed",
  "why_submitted", "prior_attempts_submitted", "quiz_answered", "archetype_assigned", "options_shown",
  "provider_fallback", "option_selected", "option_deselected", "move_locked", "options_rejected",
  "step_skipped", "options_feedback", "path_completed", "path_rated", "would_do_this_week",
  "paid_willingness", "open_feedback", "start_over", "session_abandoned", "options_relaxed",
] as const;

export const eventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  clientTs: z.string().datetime().optional(),
  sessionId: z.string().uuid(),
  wishId: z.string().uuid().nullish(),
  participantCode: z.string().max(64),
  step: z.number().int().min(1).max(5).nullish(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export const eventBatchSchema = z.object({ events: z.array(eventSchema).max(100) });
export type ClientEvent = z.infer<typeof eventSchema>;
