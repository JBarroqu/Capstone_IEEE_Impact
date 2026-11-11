import json
import re

from pydantic import ValidationError as PydanticError


class ValidationError(Exception):
    """The model answered but the output was off; the chain retries with this message as a hint."""


def issues(e: PydanticError) -> str:
    """First three problems as "path: message" (sent back to the model as a retry hint)."""
    return "; ".join(f"{'.'.join(str(p) for p in i['loc'])}: {i['msg']}" for i in e.errors()[:3])


def strip_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?\s*|\s*```\Z", "", text)


def load_json(text: str):
    try:
        return json.loads(strip_fences(text))
    except ValueError:
        raise ValidationError("response was not valid JSON") from None
