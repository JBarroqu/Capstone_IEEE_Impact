"""Policies: every key named in docs/MODULE_OWNER_DECISIONS.md exists, every choice of every policy is valid and has
working code behind it, and env overrides are validated."""
import re
from pathlib import Path

import pytest

from app.policies import loader
from app.policies.defaults import BY_KEY, POLICIES
from app.policies.notifications import RULES as NOTIFY_RULES
from app.policies.scoring.rules import RULES
from app.policies.strategies import UNLOCK, VALIDATION, effort_rule, scoring_rules, unlock_match, validation

DOC = Path(__file__).resolve().parents[3] / "docs" / "MODULE_OWNER_DECISIONS.md"


def test_every_key_in_owner_doc_exists():
    text = DOC.read_text()
    keys = set(re.findall(r"`([A-Z][A-Z_]{3,})`", text))
    keys -= {"ENV", "LLM_FAKE", "CATALOG_PATH"}
    missing = sorted(k for k in keys if k not in BY_KEY)
    assert not missing, f"MODULE_OWNER_DECISIONS.md names settings that don't exist in defaults.py: {missing}"


def test_every_policy_has_a_decision_id_and_owner():
    for p in POLICIES:
        assert re.fullmatch(r"D-\d\d", p.decision) and p.owner and p.description


def test_default_wish_flow_allows_multiple_moves():
    assert loader.get("MOVES_PER_WISH") == 3
    assert loader.get("MAX_STEPS_PER_WISH") >= 3


@pytest.mark.parametrize("p", POLICIES, ids=lambda p: p.key)
def test_default_is_valid(p):
    assert loader.coerce(p, p.default) == p.default


@pytest.mark.parametrize("key,choice", [(p.key, c) for p in POLICIES if p.kind == "choice" for c in p.choices])
def test_every_choice_resolves(key, choice):
    with loader.override(**{key: choice}):
        assert loader.get(key) == choice
        # the strategy behind the key must exist for every choice
        if key == "VALIDATION_MODE":
            assert validation().name == choice
        if key == "UNLOCK_MATCH":
            assert unlock_match().name == choice
        if key == "SCORING_RULES":
            assert scoring_rules() is RULES[choice]
        if key == "EFFORT_RULE":
            assert effort_rule().once_per_move() == (choice == "per_move_once")


def test_strategy_registries_cover_choices():
    assert set(VALIDATION) == set(BY_KEY["VALIDATION_MODE"].choices)
    assert set(UNLOCK) == set(BY_KEY["UNLOCK_MATCH"].choices)
    assert set(RULES) == set(BY_KEY["SCORING_RULES"].choices)


def test_validation_strategies_behave_as_documented():
    assert (VALIDATION["ai_then_buddy"].after_rubric(), VALIDATION["ai_then_buddy"].review_finalizes(),
            VALIDATION["ai_then_buddy"].timeout_finalizes()) == ("provisional", True, True)
    assert (VALIDATION["ai_only"].after_rubric(), VALIDATION["ai_only"].review_finalizes()) == ("final", False)
    assert (VALIDATION["buddy_required"].after_rubric(), VALIDATION["buddy_required"].timeout_finalizes()) == ("wait", False)


def test_notify_disabled_items_match_rules():
    assert set(BY_KEY["NOTIFY_DISABLED"].allowed_items) == {r.kind for r in NOTIFY_RULES.values()}


def test_bad_env_value_is_rejected(monkeypatch):
    monkeypatch.setenv("VALIDATION_MODE", "sometimes")
    with pytest.raises(loader.PolicyError):
        loader.validate_env()


def test_env_override_wins_over_default(monkeypatch):
    monkeypatch.setenv("BUDDY_TIMEOUT_DAYS", "3")
    assert loader.get("BUDDY_TIMEOUT_DAYS") == 3 and loader.source("BUDDY_TIMEOUT_DAYS") == "env"


def test_int_range_enforced():
    with pytest.raises(loader.PolicyError):
        loader.coerce(BY_KEY["RESUME_MAX_MB"], 50)


MODULE_DOCS = sorted((DOC.parent / "modules").glob("*.md"))


def test_module_docs_name_only_real_policies():
    """Each docs/modules/*.md 'Policies that affect this module' list names only keys that exist."""
    missing = []
    for f in MODULE_DOCS:
        section = f.read_text().split("## Policies that affect this module", 1)[-1].split("\n## ", 1)[0]
        missing += [f"{f.name}: {k}" for k in re.findall(r"`([A-Z][A-Z_]{3,})`", section)
                    if k not in BY_KEY and k != "LLM_PROVIDER"]
    assert not missing, f"module docs name settings that don't exist: {missing}"


def test_owner_doc_choices_match_code():
    """Every '`KEY` = **default** | other | ...' line in MODULE_OWNER_DECISIONS.md lists exactly the policy's choices,
    with the real default in bold, so an owner is never offered a choice the code doesn't have."""
    bad = []
    for key, rest in re.findall(r"`([A-Z][A-Z_]{3,})` = (.+)", DOC.read_text()):
        p = BY_KEY.get(key)
        if not p or p.kind != "choice":
            continue
        rest = re.split(r" · ", rest)[0]
        named = [re.sub(r"\s*\(.*$", "", x).strip().strip("*").strip() for x in rest.split(" | ")]
        bold = re.match(r"\*\*(.+?)\*\*", rest)
        if set(named) != {str(c) for c in p.choices} or not bold or bold.group(1) != str(p.default):
            bad.append(f"{key}: doc {named}, code {list(p.choices)} default {p.default}")
    assert not bad, bad
