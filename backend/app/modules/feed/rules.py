"""D-50: Event_Ecosystem's Home chips and the categories each one shows. People -> Social and Pro (as built).
Opportunity follows OPPORTUNITY_CHIP: Enablement and Events by default (Pro now means "your moves"), or Events and Pro
as Event_Ecosystem built it."""
from ... import policies

OPPORTUNITY = {"enablement_events": ("Enablement", "Events"), "events_pro": ("Events", "Pro")}

CHIPS: dict[str, tuple[str, ...]] = {
    "People": ("Social", "Pro"),
    "Impact": ("Impact",),
    "Growth": ("Growth",),
    "Enablement": ("Enablement",),
    "Social": ("Social",),
}


def categories(chip: str) -> tuple[str, ...] | None:
    if chip == "Opportunity":
        return OPPORTUNITY[policies.get("OPPORTUNITY_CHIP")]
    return CHIPS.get(chip)
