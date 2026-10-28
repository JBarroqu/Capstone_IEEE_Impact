"""PLACEHOLDER — Waleed will replace. Archetype names, quiz questions, and scoring are stand-ins.
The fixed quiz is only shown when every model fails to write follow-up questions. Mirrors lib/archetypes.ts (the frontend keeps its copy)."""

archetype_info = {
    "builder": {
        "label": "Builder",
        "blurb": "You learn by making things."
    },
    "connector": {
        "label": "Connector",
        "blurb": "You move faster with other people."
    },
    "planner": {
        "label": "Planner",
        "blurb": "You like a clear plan and a checklist."
    },
    "explorer": {
        "label": "Explorer",
        "blurb": "You like to try things and see what sticks."
    }
}

quiz = [
    {
        "id": "q1",
        "prompt": "You get a free Saturday for this wish. What do you do first?",
        "answers": [
            {
                "id": "a",
                "label": "Start building something",
                "scores": {
                    "builder": 2
                }
            },
            {
                "id": "b",
                "label": "Message someone who's done it",
                "scores": {
                    "connector": 2
                }
            },
            {
                "id": "c",
                "label": "Write a plan with dates",
                "scores": {
                    "planner": 2
                }
            },
            {
                "id": "d",
                "label": "Browse and see what's out there",
                "scores": {
                    "explorer": 2
                }
            }
        ]
    },
    {
        "id": "q2",
        "prompt": "When you're stuck, you usually…",
        "answers": [
            {
                "id": "a",
                "label": "Try a different approach in code",
                "scores": {
                    "builder": 2
                }
            },
            {
                "id": "b",
                "label": "Ask a friend or a group",
                "scores": {
                    "connector": 2
                }
            },
            {
                "id": "c",
                "label": "Go back to the plan and adjust it",
                "scores": {
                    "planner": 2
                }
            }
        ]
    },
    {
        "id": "q3",
        "prompt": "A good first step feels like…",
        "answers": [
            {
                "id": "a",
                "label": "A small thing I can ship today",
                "scores": {
                    "builder": 1,
                    "explorer": 1
                }
            },
            {
                "id": "b",
                "label": "A conversation",
                "scores": {
                    "connector": 2
                }
            },
            {
                "id": "c",
                "label": "A checklist item",
                "scores": {
                    "planner": 2
                }
            }
        ]
    }
]

ORDER = ("builder", "connector", "planner", "explorer")


def assign_archetype(answers: dict[str, str]) -> str:
    total = {a: 0 for a in ORDER}
    for q in quiz:
        a = next((x for x in q["answers"] if x["id"] == answers.get(q["id"])), None)
        if a:
            for k, v in a["scores"].items():
                total[k] += v
    return sorted(ORDER, key=lambda a: (-total[a], a))[0]
