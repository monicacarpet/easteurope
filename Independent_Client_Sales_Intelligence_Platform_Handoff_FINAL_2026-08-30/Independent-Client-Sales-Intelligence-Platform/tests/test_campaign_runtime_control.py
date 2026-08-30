from datetime import date
from pathlib import Path
import sys
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from campaign_runtime_control import (
    CampaignRuntimeControl,
    fetch_campaign_runtime_control,
    normalize_country_key,
)


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.rows = [row for row in self.rows if row.get(key) == value]
        return self

    def limit(self, _count):
        return self

    def execute(self):
        return _Response(self.rows)


class _Db:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        assert name == "campaign_controls"
        return _Query(list(self.rows))


def test_country_aliases_are_stable_across_agents():
    assert normalize_country_key("USA") == "united states"
    assert normalize_country_key("United States of America") == "united states"
    assert normalize_country_key("España") == "spain"
    assert normalize_country_key("Nederland") == "netherlands"


def test_runtime_control_filters_country_and_date_window():
    control = CampaignRuntimeControl(
        control_key="lead_outreach",
        enabled=True,
        start_date=date(2026, 8, 10),
        end_date=date(2026, 8, 31),
        target_countries=frozenset({"france", "germany"}),
    )
    assert not control.active_on(date(2026, 8, 9))
    assert control.active_on(date(2026, 8, 10))
    assert control.active_on(date(2026, 8, 31))
    assert not control.active_on(date(2026, 9, 1))
    assert control.country_allowed("France")
    assert not control.country_allowed("Italy")


def test_fetch_control_normalizes_supabase_values():
    db = _Db([
        {
            "control_key": "stock_promotion",
            "display_name": "Stock promotion",
            "sender_email": "stock@example.com",
            "enabled": True,
            "start_date": "2026-08-10",
            "end_date": "2026-09-10",
            "target_countries": ["USA", "España"],
            "priority_countries": ["France", "España", "France", "Nederland"],
        }
    ])
    control = fetch_campaign_runtime_control(db, "stock_promotion", log=lambda _msg: None)
    assert control.sender_email == "stock@example.com"
    assert control.start_date == date(2026, 8, 10)
    assert control.end_date == date(2026, 9, 10)
    assert control.target_countries == frozenset({"united states", "spain"})
    assert control.priority_countries == ("france", "spain", "netherlands")


def test_missing_control_falls_back_to_legacy_defaults():
    control = fetch_campaign_runtime_control(_Db([]), "lead_outreach", log=lambda _msg: None)
    assert control.enabled is True
    assert control.target_countries == frozenset()
    assert control.priority_countries == ()
    assert control.active_on(date(2026, 8, 9))


def test_split_local_send_windows_are_required_and_ordered():
    control = CampaignRuntimeControl(
        control_key="lead_outreach",
        runtime_settings={"local_send_windows": [[9, 11], [14, 17]]},
    )
    assert control.require_send_windows("local_send_windows") == ((9, 11), (14, 17))


@pytest.mark.parametrize(
    "windows",
    [[], [[11, 9]], [[9, 12], [11, 17]], [[9]], "09:00-11:00"],
)
def test_invalid_local_send_windows_fail_closed(windows):
    control = CampaignRuntimeControl(
        control_key="stock_promotion",
        runtime_settings={"local_send_windows": windows},
    )
    with pytest.raises(RuntimeError):
        control.require_send_windows("local_send_windows")
