"""Every switchable product decision (docs/MODULE_OWNER_DECISIONS.md). Use `get("KEY")` for plain values and the
strategy getters for behaviour."""
from .loader import get, public, refresh, snapshot
from .strategies import effort_rule, scoring_rules, unlock_match, validation

__all__ = ["get", "public", "refresh", "snapshot", "validation", "unlock_match", "scoring_rules", "effort_rule"]
