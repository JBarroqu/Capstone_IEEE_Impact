import type { FollowUp, QuestionSet } from "./types";

/** The answered questions in the shape the moves prompt and the wish row take. Client-safe (no server imports). */
export function toFollowUps(set: QuestionSet, answers: Record<string, string>): FollowUp[] {
  return set.questions.flatMap((q) => {
    const a = q.answers.find((x) => x.id === answers[q.id]);
    return a ? [{ question: q.prompt, answer: a.label, note: q.note }] : [];
  });
}
