"""The only functions other modules may call in Module 4 (import-linter enforces this)."""
from . import service


async def is_accepted_buddy(user_id: str, selected_move_id: str) -> bool:
    return await service.is_accepted_buddy(user_id, selected_move_id)


async def counting_reviews(evidence_ids: list[str]) -> dict[str, list[tuple]]:
    """{evidence_id: [(reviewer tier, rating, confirmed, comment)]} for reviews that count toward points."""
    return await service.counting_reviews(evidence_ids)


async def pending_reviews(user_id: str) -> list[dict]:
    return await service.pending_reviews(user_id)


async def has_buddy(selected_move_id: str) -> bool:
    return await service.has_buddy(selected_move_id)
