from __future__ import annotations

import re
from typing import Any


def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"", "none", "null", "nan", "nat", "<na>"} else text


def sanitize_campaign_policy(value: Any, max_length: int = 12000) -> str:
    """Preserve readable line breaks while removing unsafe control characters."""
    text = _clean(value).replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(ch for ch in text if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_length]


def campaign_copy_policy(campaign: dict[str, Any]) -> str:
    """Return the live Supabase campaign_goal or fail closed.

    Customer-facing copy rules are intentionally not embedded in agent code. The
    active email_campaigns.campaign_goal row is the single source of truth.
    """
    policy = sanitize_campaign_policy(campaign.get("campaign_goal"))
    if not policy:
        raise RuntimeError(
            "Active email campaign has no campaign_goal; refusing to generate customer copy"
        )
    return policy


def policy_word_limits(policy: str, *, default_min: int = 35, default_max: int = 140) -> tuple[int, int]:
    """Read a '70-105 words' style limit from campaign_goal when present."""
    text = sanitize_campaign_policy(policy, 12000)
    match = re.search(r"\b(\d{2,3})\s*[-–—]\s*(\d{2,3})\s+words?\b", text, flags=re.I)
    if not match:
        return default_min, default_max
    low, high = int(match.group(1)), int(match.group(2))
    if low < 1 or high < low or high > 500:
        return default_min, default_max
    return low, high


def policy_subject_word_limits(policy: str, *, default_min: int = 1, default_max: int = 8) -> tuple[int, int]:
    """Read a subject word range from campaign_goal when explicitly supplied."""
    text = sanitize_campaign_policy(policy, 12000)
    match = re.search(
        r"subject.{0,180}?\b(\d+)\s*[-–—]\s*(\d+)\s+(?:natural\s+)?words?\b",
        text,
        flags=re.I | re.S,
    )
    if not match:
        return default_min, default_max
    low, high = int(match.group(1)), int(match.group(2))
    if low < 1 or high < low or high > 20:
        return default_min, default_max
    return low, high

_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
}


def policy_paragraph_count(policy: str, *, default: int = 2) -> int:
    """Read an explicit paragraph-count requirement from campaign_goal."""
    text = sanitize_campaign_policy(policy, 12000)
    match = re.search(r"\bexactly\s+(one|two|three|four|five|\d+)\s+(?:coherent\s+|customer-facing\s+|commercial\s+)?paragraphs?\b", text, flags=re.I)
    if not match:
        return default
    token = match.group(1).lower()
    value = int(token) if token.isdigit() else _NUMBER_WORDS.get(token, default)
    return value if 1 <= value <= 5 else default


def policy_forbidden_phrases(policy: str) -> list[str]:
    """Extract explicitly quoted phrases from prohibition lines in campaign_goal.

    This lets operations change banned copy in Supabase without requiring a code
    release. Only lines that clearly contain a prohibition marker are inspected.
    """
    text = sanitize_campaign_policy(policy, 12000)
    phrases: list[str] = []
    for line in text.splitlines():
        normalized = line.lower()
        if not ("never" in normalized or "do not" in normalized or any(marker in normalized for marker in ("forbid", "banned", "ban "))):
            continue
        for quoted in re.findall(r'["“”\']([^"“”\']{4,220})["“”\']', line):
            value = quoted.strip()
            if value and value not in phrases:
                phrases.append(value)
    return phrases
