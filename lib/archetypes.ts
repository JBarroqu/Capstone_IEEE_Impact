import type { Archetype } from "./types";

// PLACEHOLDER — Waleed will replace. Archetype names, quiz questions, and scoring are stand-ins.
export const archetypeInfo: Record<Archetype, { label: string; blurb: string }> = {
  builder: { label: "Builder", blurb: "You learn by making things." },
  connector: { label: "Connector", blurb: "You move faster with other people." },
  planner: { label: "Planner", blurb: "You like a clear plan and a checklist." },
  explorer: { label: "Explorer", blurb: "You like to try things and see what sticks." },
};

export type QuizQuestion = { id: string; prompt: string; answers: { id: string; label: string; scores: Partial<Record<Archetype, number>> }[] };

export const quiz: QuizQuestion[] = [
  {
    id: "q1", prompt: "You get a free Saturday for this wish. What do you do first?",
    answers: [
      { id: "a", label: "Start building something", scores: { builder: 2 } },
      { id: "b", label: "Message someone who's done it", scores: { connector: 2 } },
      { id: "c", label: "Write a plan with dates", scores: { planner: 2 } },
      { id: "d", label: "Browse and see what's out there", scores: { explorer: 2 } },
    ],
  },
  {
    id: "q2", prompt: "When you're stuck, you usually…",
    answers: [
      { id: "a", label: "Try a different approach in code", scores: { builder: 2 } },
      { id: "b", label: "Ask a friend or a group", scores: { connector: 2 } },
      { id: "c", label: "Go back to the plan and adjust it", scores: { planner: 2 } },
    ],
  },
  {
    id: "q3", prompt: "A good first step feels like…",
    answers: [
      { id: "a", label: "A small thing I can ship today", scores: { builder: 1, explorer: 1 } },
      { id: "b", label: "A conversation", scores: { connector: 2 } },
      { id: "c", label: "A checklist item", scores: { planner: 2 } },
    ],
  },
];

export function assignArchetype(answers: Record<string, string>): Archetype {
  const total: Record<Archetype, number> = { builder: 0, connector: 0, planner: 0, explorer: 0 };
  for (const q of quiz) {
    const a = q.answers.find((x) => x.id === answers[q.id]);
    if (a) for (const [k, v] of Object.entries(a.scores)) total[k as Archetype] += v ?? 0;
  }
  return (Object.keys(total) as Archetype[]).sort((a, b) => total[b] - total[a] || a.localeCompare(b))[0];
}
