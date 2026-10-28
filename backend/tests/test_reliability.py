from datetime import datetime, timezone

from wish_api.csv_export import to_csv
from wish_api.providers.health import Health, is_daily_quota, ms_until_pacific_midnight


def test_csv_defuses_formulas_but_not_numbers():
    c = to_csv([{"a": '=HYPERLINK("x")', "b": -3, "c": "@SUM(A1)", "d": "fine"}])
    assert "\"'=HYPERLINK(\"\"x\"\")\"" in c and ",-3," in c and "'@SUM(A1)" in c


def test_daily_quota_detection():
    assert is_daily_quota('429 RESOURCE_EXHAUSTED "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"')
    assert not is_daily_quota('429 "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"')


def test_midnight_pacific():
    # 2026-10-26 23:00 PDT = 2026-10-27 06:00 UTC: one hour left.
    assert ms_until_pacific_midnight(datetime(2026, 10, 27, 6, tzinfo=timezone.utc).timestamp() * 1000) == 3_600_000


def test_explicit_cooldown():
    t = {"now": 0}
    h = Health(lambda: t["now"])
    h.fail("m", "rate_limited", "daily", False, 5 * 3_600_000)
    t["now"] = 4 * 3_600_000
    assert h.cooling("m")
    t["now"] = 5 * 3_600_000 + 1
    assert not h.cooling("m")
