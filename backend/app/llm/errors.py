class RateLimited(Exception):
    pass


class Timeout(Exception):
    pass


class QueueTimeout(Exception):
    pass


class LlmUnavailable(Exception):
    """No backend could produce a valid answer within the time budget. The student sees a retry; nothing is substituted."""

    def __init__(self, reason: str, detail: str | None = None):
        self.reason, self.detail = reason, detail
        super().__init__(f"LLM unavailable ({reason})" + (f": {detail}" if detail else ""))
