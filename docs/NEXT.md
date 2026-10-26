# Planned work

## Generated follow-up questions (replace the fixed archetype quiz)

**Status (2026-10-26): built.**
- `lib/prompts/questions.v1.ts` (`QUESTIONS_VERSION`), run through `runChain` from `/api/questions`.
- Questions are generated when "A bit of context" is continued; a loading state shows while they're written.
- The answers go into the moves prompt as `followUps` (`moves.v4`), are saved on `wishes.follow_ups`, and appear in the admin participant card and the export.
- If every model fails, the fixed quiz is shown (`source: "fixed"`) and still assigns an archetype. Skip stays.
- Events: `questions_shown{source,provider,model,prompt_version,latency_ms,tried,fail_reason,questions}`; `quiz_answered` now also carries `question`, `answer_text` and `source`.
- Decisions taken for the open questions below: always 3 questions; archetypes are kept only for the fixed fallback, and generated answers go straight into the moves prompt.
- Still to do: admin comparison of ratings for answered vs skipped and generated vs fixed.

The original plan follows.

**Now:** after the "A bit of context" screen (why + what they already tried), every student gets the same 3 fixed questions (`quiz` in `lib/archetypes.ts`). The answers map to one of 4 archetypes (builder, connector, planner, explorer), which steers the moves. Students can skip them (`quiz_skipped{answered}`).

**Plan:** the model writes the 3 questions for each student, based on what they have told us so far, so the questions dig into what is actually unclear about this wish instead of asking a general personality quiz.

Inputs to the question prompt:
- the wish text and its classification (focus, domains, type) from `/api/classify`
- the "why" answer and prior attempts (chips + text) from the previous screen
- other data as it becomes available: earlier wishes in the same session, moves they picked or rejected before (and the reject reasons), and patterns across participants (e.g. which kinds of moves get rated low for this kind of wish)

Shape:
- New prompt `lib/prompts/questions.v1.ts` with its own version constant, run through the same model chain (`runChain`), so failover and the admin Models panel cover it.
- Each question: prompt plus 3-4 tappable answers (keep the one-tap format; no free text), and a short note of what the answer tells the move generator.
- Generate while the student is on the "A bit of context" screen is not possible (needs its answers), so generate on that screen's Continue and show a short loading state; prefetch is fine because the classification is usually done by then.
- Pass the answered questions and answers into the moves prompt (`WishContext`) instead of, or alongside, the archetype.
- Keep the fixed quiz as the fallback if every model fails, and log which one was shown (`source: llm | fixed`), like classification does.
- Keep the Skip button.

Analytics to add:
- `questions_shown{source,model,prompt_version,questions}` and per-answer events with the question text, so answers can be read without the prompt.
- Admin: show each student's generated questions and answers in their participant card; compare move ratings for students who answered vs skipped, and generated vs fixed questions.

Open questions:
- Do we still need archetypes at all, or do the answers go straight into the moves prompt?
- 3 questions, or let the model ask 1-3 depending on how clear the wish already is?
