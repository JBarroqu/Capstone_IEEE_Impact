/** Event names the API accepts (backend/wish_api/events_schema.py validates them; keep the two lists in sync). */
export const EVENT_NAMES = [
  "session_started", "consent_given", "wish_submitted", "classification_guessed", "classification_confirmed",
  "why_submitted", "prior_attempts_submitted", "quiz_answered", "archetype_assigned", "options_shown",
  "provider_fallback", "option_selected", "option_deselected", "move_locked", "options_rejected",
  "step_skipped", "options_feedback", "path_completed", "path_rated", "would_do_this_week",
  "paid_willingness", "open_feedback", "start_over", "session_abandoned", "options_relaxed", "options_failed", "quiz_skipped",
  "questions_shown",
] as const;

export type ClientEvent = {
  /** Client-made uuid, so a batch that is retried after a lost response is not stored twice. */
  id?: string;
  name: (typeof EVENT_NAMES)[number];
  clientTs?: string;
  sessionId: string;
  wishId?: string | null;
  participantCode: string;
  step?: number | null;
  payload: Record<string, unknown>;
};
