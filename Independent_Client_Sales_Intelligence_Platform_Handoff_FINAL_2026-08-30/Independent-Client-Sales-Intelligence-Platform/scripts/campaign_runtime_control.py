"""Shared Supabase runtime controls for the Platform outbound agents.

Changeable business policy belongs in ``campaign_controls`` / ``email_campaigns``
rather than in Python or GitHub workflow literals.  The agents still keep small
compatibility fallbacks so an older database can fail safely, but a current
production database is the source of truth for geography, timing, cooldowns,
queue priority and stock-selection thresholds.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import re
import unicodedata
from typing import Any, Callable


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_country_key(value: Any) -> str:
    raw = clean(value).lower()
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    raw = re.sub(r"[^a-z0-9]+", " ", raw)
    normalized = re.sub(r"\s+", " ", raw).strip()
    aliases = {
        "united states of america": "united states",
        "usa": "united states",
        "u s a": "united states",
        "uk": "united kingdom",
        "great britain": "united kingdom",
        "brasil": "brazil",
        "deutschland": "germany",
        "espana": "spain",
        "italia": "italy",
        "nederland": "netherlands",
        "reunion island": "reunion",
        "ile de la reunion": "reunion",
    }
    return aliases.get(normalized, normalized)


def as_date(value: Any) -> date | None:
    raw = clean(value)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = clean(value).lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


@dataclass(frozen=True)
class CampaignRuntimeControl:
    control_key: str
    enabled: bool = True
    start_date: date | None = None
    end_date: date | None = None
    target_countries: frozenset[str] = frozenset()
    priority_countries: tuple[str, ...] = ()
    sender_email: str = ""
    display_name: str = ""
    campaign_name: str = ""
    runtime_settings: dict[str, Any] = field(default_factory=dict)

    def active_on(self, day: date) -> bool:
        if not self.enabled:
            return False
        if self.start_date and day < self.start_date:
            return False
        if self.end_date and day > self.end_date:
            return False
        return True

    def country_allowed(self, country: Any) -> bool:
        if not self.target_countries:
            return True
        return normalize_country_key(country) in self.target_countries

    def reason_if_blocked(self, day: date) -> str:
        if not self.enabled:
            return "campaign disabled in sales platform"
        if self.start_date and day < self.start_date:
            return f"campaign starts on {self.start_date.isoformat()}"
        if self.end_date and day > self.end_date:
            return f"campaign ended on {self.end_date.isoformat()}"
        return ""

    def reason_if_blocked_for_run(self, day: date, *, preview_only: bool = False) -> str:
        if preview_only:
            return ""
        return self.reason_if_blocked(day)

    def setting(self, key: str, default: Any = None) -> Any:
        return self.runtime_settings.get(key, default)

    def setting_int(
        self,
        key: str,
        default: int,
        *,
        minimum: int | None = None,
        maximum: int | None = None,
    ) -> int:
        value = _as_int(self.setting(key), default)
        if minimum is not None:
            value = max(minimum, value)
        if maximum is not None:
            value = min(maximum, value)
        return value

    def setting_float(
        self,
        key: str,
        default: float,
        *,
        minimum: float | None = None,
        maximum: float | None = None,
    ) -> float:
        value = _as_float(self.setting(key), default)
        if minimum is not None:
            value = max(minimum, value)
        if maximum is not None:
            value = min(maximum, value)
        return value

    def setting_bool(self, key: str, default: bool) -> bool:
        return _as_bool(self.setting(key), default)

    def setting_text(self, key: str, default: str = "") -> str:
        value = clean(self.setting(key))
        return value or default

    def setting_weekdays(self, key: str, default: set[int]) -> set[int]:
        raw = self.setting(key)
        values: list[Any]
        if isinstance(raw, (list, tuple, set)):
            values = list(raw)
        elif clean(raw):
            values = clean(raw).split(",")
        else:
            return set(default)
        parsed = {_as_int(value, -1) for value in values}
        parsed = {value for value in parsed if 0 <= value <= 6}
        return parsed or set(default)

    def require_setting(self, key: str) -> Any:
        if key not in self.runtime_settings or self.runtime_settings.get(key) is None:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' is missing required runtime setting '{key}'"
            )
        return self.runtime_settings[key]

    def require_int(
        self,
        key: str,
        *,
        minimum: int | None = None,
        maximum: int | None = None,
    ) -> int:
        raw = self.require_setting(key)
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' runtime setting '{key}' must be an integer"
            ) from exc
        if minimum is not None and value < minimum:
            raise RuntimeError(f"Runtime setting '{key}' must be >= {minimum}")
        if maximum is not None and value > maximum:
            raise RuntimeError(f"Runtime setting '{key}' must be <= {maximum}")
        return value

    def require_float(
        self,
        key: str,
        *,
        minimum: float | None = None,
        maximum: float | None = None,
    ) -> float:
        raw = self.require_setting(key)
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' runtime setting '{key}' must be numeric"
            ) from exc
        if minimum is not None and value < minimum:
            raise RuntimeError(f"Runtime setting '{key}' must be >= {minimum}")
        if maximum is not None and value > maximum:
            raise RuntimeError(f"Runtime setting '{key}' must be <= {maximum}")
        return value

    def require_bool(self, key: str) -> bool:
        raw = self.require_setting(key)
        if isinstance(raw, bool):
            return raw
        text = clean(raw).lower()
        if text in {"1", "true", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "no", "n", "off"}:
            return False
        raise RuntimeError(
            f"Campaign control '{self.control_key}' runtime setting '{key}' must be boolean"
        )

    def require_text(self, key: str) -> str:
        value = clean(self.require_setting(key))
        if not value:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' runtime setting '{key}' must not be blank"
            )
        return value

    def require_weekdays(self, key: str) -> set[int]:
        raw = self.require_setting(key)
        values = list(raw) if isinstance(raw, (list, tuple, set)) else clean(raw).split(",")
        try:
            parsed = {int(value) for value in values}
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' runtime setting '{key}' must contain weekday integers"
            ) from exc
        if not parsed or any(value < 0 or value > 6 for value in parsed):
            raise RuntimeError(f"Runtime setting '{key}' must contain only weekday integers 0..6")
        return parsed

    def require_send_windows(self, key: str) -> tuple[tuple[int, int], ...]:
        """Return validated recipient-local half-open hour windows.

        Supabase stores this as JSON, for example ``[[9, 11], [14, 17]]``.
        A local time is eligible when ``start <= hour < end``.  Keeping the
        policy in one ordered value avoids accidentally treating the lunch
        break as sendable time.
        """
        raw = self.require_setting(key)
        if not isinstance(raw, (list, tuple)) or not raw:
            raise RuntimeError(
                f"Campaign control '{self.control_key}' runtime setting '{key}' must be a non-empty list"
            )

        parsed: list[tuple[int, int]] = []
        for value in raw:
            if not isinstance(value, (list, tuple)) or len(value) != 2:
                raise RuntimeError(
                    f"Runtime setting '{key}' must contain [start_hour, end_hour] pairs"
                )
            try:
                start_hour, end_hour = int(value[0]), int(value[1])
            except (TypeError, ValueError) as exc:
                raise RuntimeError(
                    f"Runtime setting '{key}' hour values must be integers"
                ) from exc
            if not (0 <= start_hour < end_hour <= 24):
                raise RuntimeError(
                    f"Runtime setting '{key}' windows must satisfy 0 <= start < end <= 24"
                )
            if parsed and start_hour < parsed[-1][1]:
                raise RuntimeError(
                    f"Runtime setting '{key}' windows must be ordered and non-overlapping"
                )
            parsed.append((start_hour, end_hour))
        return tuple(parsed)


def _row_to_control(control_key: str, row: dict[str, Any]) -> CampaignRuntimeControl:
    targets = frozenset(
        normalize_country_key(value)
        for value in (row.get("target_countries") or [])
        if normalize_country_key(value)
    )
    priority_values: list[str] = []
    for value in (row.get("priority_countries") or []):
        normalized = normalize_country_key(value)
        if normalized and normalized not in priority_values:
            priority_values.append(normalized)
    runtime_settings = row.get("runtime_settings")
    if not isinstance(runtime_settings, dict):
        runtime_settings = {}
    return CampaignRuntimeControl(
        control_key=control_key,
        enabled=bool(row.get("enabled", True)),
        start_date=as_date(row.get("start_date")),
        end_date=as_date(row.get("end_date")),
        target_countries=targets,
        priority_countries=tuple(priority_values),
        sender_email=clean(row.get("sender_email")).lower(),
        display_name=clean(row.get("display_name")),
        campaign_name=clean(row.get("campaign_name")),
        runtime_settings=dict(runtime_settings),
    )


def fetch_campaign_runtime_control(
    db: Any,
    control_key: str,
    *,
    log: Callable[[str], None] = print,
) -> CampaignRuntimeControl:
    """Read one control row from Supabase.

    Current deployments include ``runtime_settings``.  The legacy-select retry is
    deliberately read-only compatibility for a database that has not yet applied
    the migration; it does not reintroduce legacy business routing.
    """
    columns = (
        "control_key,display_name,campaign_name,sender_email,enabled,start_date,end_date,"
        "target_countries,priority_countries,runtime_settings"
    )
    legacy_columns = (
        "control_key,display_name,campaign_name,sender_email,enabled,start_date,end_date,"
        "target_countries,priority_countries"
    )
    try:
        try:
            response = (
                db.table("campaign_controls")
                .select(columns)
                .eq("control_key", control_key)
                .limit(1)
                .execute()
            )
        except Exception:
            response = (
                db.table("campaign_controls")
                .select(legacy_columns)
                .eq("control_key", control_key)
                .limit(1)
                .execute()
            )
        rows = response.data or []
        if not rows:
            log(f"Campaign control '{control_key}' not found; using compatibility defaults.")
            return CampaignRuntimeControl(control_key=control_key)
        return _row_to_control(control_key, rows[0])
    except Exception as exc:
        log(f"Campaign control lookup unavailable for '{control_key}': {exc}. Using compatibility defaults.")
        return CampaignRuntimeControl(control_key=control_key)
