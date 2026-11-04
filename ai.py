import json
import time
from google import genai
from google.genai import types
from .config import settings

RUBRIC = ["relevance", "completeness", "quality", "clarity"]

TRANSIENT_CODES = (429, 500, 503, 504)
RETRIES = 3  # first try + 2 quick retries (waits 1s, then 2s). Set to 1 for no automatic retries.

BUSY_MESSAGE = "The AI reviewer is busy right now. Your evidence was saved - please try again shortly."


class AIBusyError(Exception):
    """The AI service stayed overloaded/unavailable after a few quick retries (temporary)."""


def _model_name():
    # Tolerate common copy/paste slips in the env var: quotes, spaces, or "GEMINI_MODEL=" in the value.
    name = (settings.gemini_model or "").strip().strip("\"'").strip()
    if "=" in name:
        name = name.split("=")[-1].strip().strip("\"'").strip()
    return name or "gemini-3.8-flash"


def _generate(client, prompt):
    model = _model_name()
    last_err = None
    for attempt in range(RETRIES):
        try:
            return client.models.generate_content(
                model=model,
                contents=[
                    "You are a careful evidence assessor. Never fabricate artifact inspection.",
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                ),
            )
        except Exception as e:
            last_err = e
            if getattr(e, "code", None) not in TRANSIENT_CODES:
                raise  # bad key, bad model name, bad request: retrying won't help
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt)  # backoff: 1s, then 2s
    raise AIBusyError(BUSY_MESSAGE) from last_err


def rate_evidence(summary: str, skill_name: str, artifact_type: str, artifact_url: str | None):
    if not settings.gemini_api_key:
        raise RuntimeError("AI is not configured. Add GEMINI_API_KEY to the backend environment.")

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = f'''Evaluate student evidence for the skill: {skill_name}.
Artifact type: {artifact_type}
Submitted URL (not fetched/verified by this service): {artifact_url or "none"}
Student-provided description:
{summary}

Score each criterion from 0 to 1, equally weighted:
- relevance: evidence matches the skill
- completeness: sufficient detail/artifact context
- quality: demonstrated quality of work
- clarity: process and results are understandable

Do not claim you opened or inspected a URL or file unless its contents are included in the supplied text.
Return only JSON with keys: criteria (object with four 0..1 values), overall_score (0..1),
confidence (0..1), suggested_difficulty (easy|moderate|hard), feedback (string).
Be constructive and specific.'''

    response = _generate(client, prompt)

    if not response.text:
        raise ValueError("Gemini returned an empty response.")
    data = json.loads(response.text)
    vals = [float(data["criteria"][k]) for k in RUBRIC]
    if any(v < 0 or v > 1 for v in vals):
        raise ValueError("AI returned an invalid criterion score.")
    overall = sum(vals) / 4
    return {
        "criteria": data["criteria"],
        "overall_score": overall,
        "confidence": max(0, min(1, float(data["confidence"]))),
        "suggested_difficulty": data.get("suggested_difficulty", "moderate"),
        "feedback": str(data.get("feedback", ""))[:5000],
    }