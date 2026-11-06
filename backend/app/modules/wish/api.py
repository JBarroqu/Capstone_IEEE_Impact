"""The only functions other modules may call in Module 2 (import-linter enforces this). Returns contracts."""
from ...contracts import SelectedMove
from ...platform import bus
from . import service


async def get_selected_move(selected_move_id: str) -> SelectedMove | None:
    return await service.get_selected_move(selected_move_id)


async def set_selected_move_status(selected_move_id: str, status: str) -> None:
    """Growth moves a selected move through evidence_submitted -> awaiting_review -> validated | needs_work."""
    await service.set_status(selected_move_id, status)


async def list_selected_moves(user_id: str, status: str | None = None) -> list[dict]:
    return await service.list_selected(user_id, status)


async def list_wishes(user_id: str) -> list[dict]:
    return await service.list_wishes(user_id)


def register() -> None:
    """Wire the subscribers that let the wish module announce a newly opened step (D-03)."""
    for name in ("EvidenceSubmitted", "EvidenceScored", "EvidenceValidated", "EvidenceNeedsWork"):
        bus.subscribe(name, service.maybe_next_move_ready)
