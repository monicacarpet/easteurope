from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from campaign_runtime_control import CampaignRuntimeControl


def test_disabled_campaign_blocks_live_but_not_preview():
    control = CampaignRuntimeControl(control_key="lead_outreach", enabled=False)
    day = date(2026, 8, 16)
    assert control.reason_if_blocked_for_run(day, preview_only=False) == "campaign disabled in sales platform"
    assert control.reason_if_blocked_for_run(day, preview_only=True) == ""


def test_out_of_window_campaign_still_allows_preview():
    control = CampaignRuntimeControl(control_key="stock_promotion", enabled=True, start_date=date(2026, 9, 1))
    assert control.reason_if_blocked_for_run(date(2026, 8, 16), preview_only=True) == ""
