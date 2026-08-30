from __future__ import annotations

import csv
import json
import os
import imaplib
import random
import re
import smtplib
import ssl
import time
import unicodedata
from html import escape
from pathlib import Path

import dns.exception
import dns.resolver
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parsedate_to_datetime
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from google import genai
from google.genai import types
from pydantic import BaseModel, Field
try:
    from supabase import Client, create_client
except ImportError:  # offline tests
    Client = Any  # type: ignore[assignment,misc]
    create_client = None
from timezonefinder import TimezoneFinder
from campaign_runtime_control import fetch_campaign_runtime_control, normalize_country_key
from campaign_copy_policy import campaign_copy_policy, policy_forbidden_phrases, policy_paragraph_count, policy_subject_word_limits, policy_word_limits

COMPANY_NAME = os.environ.get("COMPANY_NAME", "Client Company").strip()
COMPANY_WEBSITE = os.environ.get("COMPANY_WEBSITE", "https://example.com/").strip()
COMPANY_PROFILE = os.environ.get(
    "COMPANY_PROFILE",
    "Configure the verified company profile in the client-owned repository variables before live use.",
).strip()

SMTP_HOST = os.environ.get("OUTREACH_SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("OUTREACH_SMTP_PORT", "465"))
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_RESEARCH_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash"
AGENT_VERSION = "2026-08-06-GLOBAL-MARKET-MIX-NATIVE-FALLBACK-V16.5"
PATCH_VERSION = "2026-08-17-SENDER-PROFILE-POLICY-ISOLATION-P14"
MANUAL_QUEUE_FIX_VERSION = "2026-08-19-PERSIST-UNTIL-SENT-P26"
MANUAL_RUN_FIX_VERSION = "2026-08-21-MANUAL-RUN-QUEUE-FORCE-P36"
RELIABILITY_RELEASE_VERSION = "2026-08-21-MANUAL-FIRST-AUTO-FILL-P37"
EMAIL_RENDER_FIX_VERSION = "2026-08-22-NAMED-GREETING-COPY-P39"
OPT_OUT_TEXT = 'If this is not relevant, you may reply and I will not contact you again.'


# 2026-08-14 compatibility upgrade: keep legacy CI/API markers while changing runtime routing.
STRATEGIC_ROUTE = "strategic_oem_container"
STRATEGIC_INITIAL_STATUS = "not_contacted"
FOLLOWUP_1_STATUS = "followup_1_pending"
FOLLOWUP_2_STATUS = "followup_2_pending"
FOLLOWUP_DONE_STATUS = "sequence_complete"

CONSUMER_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "yahoo.co.uk",
    "hotmail.com", "hotmail.fr", "outlook.com", "live.com", "icloud.com",
    "aol.com", "protonmail.com", "proton.me", "gmx.com", "gmx.de",
    "mail.com", "orange.fr", "wanadoo.fr", "laposte.net", "free.fr",
    "qq.com", "163.com", "126.com",
}

EMAIL_STATUS_PRIORITY = {
    # Highest-confidence mailbox evidence.
    "valid": 700,
    "verified": 700,
    "deliverable": 700,

    # Published or discovered business addresses.
    "official_website_published": 600,
    "web_source_published": 550,
    "found": 500,
    "public_published_not_mailbox_verified": 450,

    # Lower-confidence addresses. These are still allowed after stronger leads
    # have been exhausted, provided syntax and MX validation pass at send time.
    "syntax_valid_domain_aligned": 350,
    "existing_source_unverified": 250,
    "source_only_unverified": 200,
}

# The worker uses a quality waterfall rather than permanently holding these
# records. High-quality addresses are always ranked first; lower tiers are used
# only after the stronger records in the same market lane are exhausted.
LOWEST_UNKNOWN_STATUS_PRIORITY = 100

# Contact-quality waterfall. Every tier remains subject to the permanent safety
# rules: valid syntax/MX, no bounce/opt-out, no duplicate contact, verified
# flooring relevance, no competitor, usable company identity and factual copy.
TIER_1_BUYER_TOKENS = {
    "buyer", "buying", "import", "imports", "procurement", "purchase",
    "purchasing", "sourcing", "supplychain", "direction", "management",
    "owner", "director", "ceo", "md",
}
TIER_2_BUSINESS_TOKENS = {
    "operations", "operation", "commercial", "sales", "business", "export",
    "wholesale", "trade", "distribution",
}
TIER_3_GENERAL_TOKENS = {
    "contact", "enquiries", "enquiry", "inquiries", "inquiry", "hello",
    "office", "admin", "info", "online", "web",
}
TIER_4_LAST_RESORT_TOKENS = {
    "reception", "accueil", "customercare", "customerservice", "support",
    "showroom", "salesorders", "orders", "service", "store", "shop",
    "boutique", "branch", "commande", "commandes",
}
GENERIC_MAILBOX_LOCAL_PARTS = (
    TIER_2_BUSINESS_TOKENS | TIER_3_GENERAL_TOKENS | TIER_4_LAST_RESORT_TOKENS
)

BLOCKED_EMAIL_STATUS_FRAGMENTS = {
    "invalid", "undeliverable", "bounced", "bounce", "rejected",
    "disposable", "spamtrap", "do_not_contact", "opt_out", "unsubscribed",
}

NEGATIVE_FIT_TERMS = {
    "not_target", "not target", "not relevant", "irrelevant",
    "service_provider", "service provider", "wood_only", "wood only",
    "wood-only", "carpet_only", "carpet only", "ceramic_only",
    "ceramic only", "geotechnical",
}

COMMERCIAL_EVIDENCE_FIELDS = (
    "buyer_type", "business_type", "company_type", "organization_type",
    "container_readiness", "import_history", "import_status", "import_notes",
    "gold_split_reason", "enrichment_fit_reason", "pvc_fit_status",
    "qualification_reason", "notes", "parent_company", "name",
)

IMPORTER_TERMS = {
    "importer", "importateur", "importadora", "importador", "importeur",
    "importatore", "importazione", "importacion", "importacao",
    "direct importer", "active importer", "confirmed importer",
}
WHOLESALE_TERMS = {
    "wholesaler", "wholesale", "grossiste", "grossista", "groothandel",
    "hurtownia", "hurtownik", "atacadista", "mayorista",
    "distribuidor importador",
}

DISTRIBUTOR_CHAIN_TERMS = {
    "distributor", "distribution", "distributeur", "distribuidor", "distributore",
    "dystrybutor", "verdeler", "national distributor", "regional distributor",
    "retail chain", "store chain", "multi branch", "multi location", "network of stores",
    "chaine", "cadena", "filiales", "succursales", "oddzial", "branch network",
}
RESEARCH_SCALE_TERMS = {
    "national", "regional", "international", "multi branch", "multi location",
    "multiple locations", "multiple sales points", "physical store locations",
    "branch network", "agency network", "showroom network", "network of stores",
    "chain", "agencies", "branches", "depots", "filiales", "succursales",
    "agences", "reseau d agences", "oddzialy", "sieci sklepow",
}
PROFESSIONAL_DISTRIBUTION_TERMS = {
    "professional customers", "professionals", "trade customers", "b2b",
    "contractors", "installers", "clients professionnels", "professionnels",
    "negoce", "distribution professionnelle", "kunden im fachhandel",
    "gewerbekunden", "clientes profesionales", "profissionais",
}
PROJECT_CHANNEL_TERMS = {
    "project supplier", "contract flooring", "contractor channel", "project channel",
    "architect", "specifier", "hospitality", "commercial projects", "tender",
    "tertiaire", "chantier", "projet", "obras", "proyectos", "projekt",
}
RETAIL_TERMS = {
    "retailer", "retail", "showroom", "flooring shop", "flooring store", "boutique",
    "magasin", "tienda", "loja", "fachhandel", "studio podlog", "salon",
}
INSTALLER_TERMS = {
    "installer", "installation", "floor layer", "floorlayer", "fitter", "contractor",
    "poseur", "pose", "artisan", "verlegung", "bodenleger", "verlegebetrieb",
    "instalador", "instalacao", "montador", "ukladanie", "wykonawca",
}
PURCHASING_ROLE_TERMS = {
    "procurement", "purchasing", "purchase", "buyer", "buying", "sourcing",
    "category manager", "product manager", "acheteur", "achats", "approvisionnement",
    "compras", "comprador", "suprimentos", "einkauf", "einkaufer", "beschaffung",
    "inkoop", "inkoper", "zakupy", "kupiec", "acquisti", "buyer",
}
EXECUTIVE_ROLE_TERMS = {
    "owner", "founder", "ceo", "chief executive", "managing director", "general manager",
    "director", "president", "proprietaire", "gerant", "directeur", "fondateur",
    "dueno", "propietario", "diretor", "geschaftsfuhrer", "inhaber", "eigenaar",
    "wlasciciel", "prezes", "titolare", "amministratore",
}
CATEGORY_ROLE_TERMS = {
    "category", "product", "commercial", "merchandising", "range manager", "assortment",
    "chef de produit", "responsable commercial", "responsable de gamme",
    "produktmanager", "sortimentsmanager", "kierownik produktu",
}

EMAIL_PATTERN = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
TIMEZONE_FINDER = TimezoneFinder(in_memory=True)


class GeminiQuotaError(RuntimeError):
    """Stop the entire run when Gemini rate or daily quota is exhausted."""


def is_gemini_quota_error(exc: Exception) -> bool:
    """Recognize Gemini 429 errors without depending on one SDK exception type."""
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    try:
        numeric_code = int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        numeric_code = None
    text = str(exc).lower()
    return (
        numeric_code == 429
        or "resource_exhausted" in text
        or "rate_limit_exceeded" in text
        or "quota_exceeded" in text
        or ("429" in text and "quota" in text)
    )


def is_gemini_transient_error(exc: Exception) -> bool:
    """Recognize temporary Gemini service failures that may use the fallback model."""
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    try:
        numeric_code = int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        numeric_code = None
    normalized = str(exc).lower()
    return (
        numeric_code in {408, 500, 502, 503, 504}
        or "unavailable" in normalized
        or "high demand" in normalized
        or "temporarily unavailable" in normalized
        or "internal server error" in normalized
        or "bad gateway" in normalized
        or "gateway timeout" in normalized
        or any(f"{code}" in normalized for code in (408, 500, 502, 503, 504))
    )


def build_gemini_client() -> Any:
    """Use the SDK's built-in short retry policy; do not stack another retry loop."""
    retry_options = types.HttpRetryOptions(
        attempts=2,
        initial_delay=1.0,
        max_delay=4.0,
        exp_base=2.0,
        jitter=0.5,
        http_status_codes=[408, 429, 500, 502, 503, 504],
    )
    return genai.Client(
        api_key=require_env("GEMINI_API_KEY"),
        http_options=types.HttpOptions(
            retry_options=retry_options,
            timeout=120_000,
        ),
    )


def gemini_generate_with_failover(
    client: Any,
    *,
    primary_model: str,
    fallback_model: str,
    prompt: str,
    response_schema: type[BaseModel] | None = None,
    use_url_context: bool = True,
) -> tuple[Any, str, int]:
    """Try the configured model and one fallback without embedding copy policy in code."""
    models = []
    for candidate in (primary_model, fallback_model):
        candidate = clean(candidate)
        if candidate and candidate not in models:
            models.append(candidate)

    last_error: Exception | None = None
    for model_call, model_name in enumerate(models, start=1):
        try:
            throttle_gemini()
            schema = response_schema or CompanyResearch
            config_kwargs: dict[str, Any] = {
                "response_mime_type": "application/json",
                "response_schema": schema,
            }
            if use_url_context:
                config_kwargs["tools"] = [{"url_context": {}}]
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            if model_call > 1:
                print("Gemini fallback model succeeded:", model_name)
            return response, model_name, model_call
        except Exception as exc:
            last_error = exc
            if is_gemini_quota_error(exc):
                raise
            if not is_gemini_transient_error(exc):
                raise
            if model_call < len(models):
                print(
                    "Gemini primary model unavailable after SDK retries; "
                    f"switching to {models[model_call]}: {safe_prompt_text(exc, 220)}"
                )
                continue
            raise

    if last_error is not None:
        raise last_error
    raise RuntimeError("No Gemini model was configured")


_LAST_GEMINI_CALL_AT = 0.0


def throttle_gemini() -> None:
    """Keep free-tier Gemini calls far enough apart to avoid burst-rate 429s."""
    global _LAST_GEMINI_CALL_AT
    interval = max(0.0, float(os.environ.get("MIN_GEMINI_INTERVAL_SECONDS", "13") or 13))
    now = time.monotonic()
    wait_seconds = interval - (now - _LAST_GEMINI_CALL_AT)
    if _LAST_GEMINI_CALL_AT and wait_seconds > 0:
        print(f"Gemini free-tier throttle: waiting {wait_seconds:.1f} seconds")
        time.sleep(wait_seconds)
    _LAST_GEMINI_CALL_AT = time.monotonic()


class PermanentEmailDomainError(RuntimeError):
    """A permanent recipient-domain problem that should suppress the lead."""


class TransientEmailDomainError(RuntimeError):
    """A temporary DNS problem. The lead should remain queued for a later run."""


class EmailDraft(BaseModel):
    # Generous parsing limits prevent an otherwise useful Gemini response from
    # being discarded before Python can normalize it safely.
    language_name: str = Field(default="English", min_length=2, max_length=120)
    subject: str = Field(min_length=3, max_length=240)
    body: str = Field(min_length=40, max_length=4000)
    signoff: str = Field(default="", max_length=500)
    opt_out: str = Field(default="", max_length=500)
    personalization_used: str = Field(default="", max_length=1200)
    research_fact_used: str = Field(default="F1", max_length=500)
    generation_source: str = Field(default="unknown", max_length=80)


class CompanyResearch(BaseModel):
    company_fit: bool = True
    confidence: str = Field(default="low", min_length=2, max_length=30)
    business_model: str = Field(default="flooring business", min_length=2, max_length=320)
    buyer_type: str = Field(default="unknown", min_length=2, max_length=80)
    competitor_risk: bool = False
    verified_branch_or_location: str = Field(default="", max_length=160)
    verified_facts: list[str] = Field(default_factory=list)
    likely_needs: list[str] = Field(default_factory=list)
    recommended_angle: str = Field(default="", max_length=500)
    commercial_interpretation: str = Field(default="", max_length=500)
    selected_sales_angle: str = Field(default="", max_length=160)
    evidence_limits: str = Field(default="", max_length=500)
    source_urls: list[str] = Field(default_factory=list)
    generation_source: str = Field(default="dataset_no_website", max_length=80)
    gemini_attempts: int = Field(default=0, ge=0, le=10)
    model_used: str = Field(default="none", max_length=100)
    # Website mode returns research and the customer-facing draft in the same
    # Gemini request. This halves API use and avoids free-tier RPM exhaustion.
    draft: EmailDraft | None = None


class DraftReview(BaseModel):
    approved: bool = False
    uses_specific_verified_fact: bool = False
    sender_identity_correct: bool = False
    collaboration_value_clear: bool = False
    catalogue_and_samples_after_reply: bool = False
    non_generic: bool = False
    spam_safe: bool = False
    issues: list[str] = Field(default_factory=list)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"", "none", "null", "nan", "nat", "<na>"} else text


def lower(value: Any) -> str:
    return clean(value).lower()


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_bool(value: Any) -> bool:
    if value is True:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y"}
    if isinstance(value, (int, float)):
        return value == 1
    return False


def parse_weekdays(raw: str) -> set[int]:
    result: set[int] = set()
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            day = int(item)
        except ValueError as exc:
            raise RuntimeError("LOCAL_SEND_WEEKDAYS must contain integers from 0 to 6") from exc
        if day < 0 or day > 6:
            raise RuntimeError("LOCAL_SEND_WEEKDAYS values must be from 0 to 6")
        result.add(day)
    if not result:
        raise RuntimeError("LOCAL_SEND_WEEKDAYS cannot be empty")
    return result


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower().strip() if "@" in email else ""


def valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.fullmatch(email.strip()))


def email_confidence_priority(value: Any) -> float:
    """Normalize text or numeric email-confidence values for sorting."""
    raw = lower(value)
    if raw == "high":
        return 3.0
    if raw == "medium":
        return 2.0
    if raw == "low":
        return 1.0
    return as_float(value, 0.0)


@lru_cache(maxsize=10000)
def recipient_mx_hosts(domain: str) -> tuple[str, ...]:
    """Return MX hosts or raise a permanent/transient domain-validation error."""
    normalized = domain.strip().lower().rstrip(".")
    if not normalized:
        raise PermanentEmailDomainError("Recipient domain is empty")

    resolver = dns.resolver.Resolver(configure=True)
    resolver.timeout = 3.0
    resolver.lifetime = 7.0

    try:
        answers = resolver.resolve(normalized, "MX", search=False)
    except dns.resolver.NXDOMAIN as exc:
        raise PermanentEmailDomainError(
            f"Recipient domain does not exist: {normalized}"
        ) from exc
    except dns.resolver.NoAnswer as exc:
        raise PermanentEmailDomainError(
            f"Recipient domain has no MX records: {normalized}"
        ) from exc
    except (dns.resolver.NoNameservers, dns.exception.Timeout) as exc:
        raise TransientEmailDomainError(
            f"Temporary DNS/MX lookup failure for {normalized}: {exc}"
        ) from exc
    except dns.exception.DNSException as exc:
        raise TransientEmailDomainError(
            f"Unexpected DNS/MX lookup failure for {normalized}: {exc}"
        ) from exc

    records: list[tuple[int, str]] = []
    for answer in answers:
        host = str(answer.exchange).rstrip(".").lower()
        if host == "":
            continue
        if host == ".":
            raise PermanentEmailDomainError(
                f"Recipient domain explicitly does not accept email: {normalized}"
            )
        records.append((int(answer.preference), host))

    if not records:
        raise PermanentEmailDomainError(
            f"Recipient domain has no usable MX records: {normalized}"
        )

    records.sort(key=lambda item: (item[0], item[1]))
    return tuple(host for _, host in records)


def validate_recipient_domain(recipient_email: str) -> tuple[str, ...]:
    # Consumer domains are allowed only after eligibility confirms that the
    # address belongs to a named company decision-maker. MX validation still
    # applies exactly as it does to company domains.
    return recipient_mx_hosts(email_domain(recipient_email))


def supabase_client() -> Client:
    return create_client(require_env("SUPABASE_URL"), require_env("SUPABASE_SERVICE_ROLE_KEY"))


def campaign_local_datetime(now_utc: datetime, timezone_name: str) -> datetime:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(f"Invalid CAMPAIGN_TIMEZONE: {timezone_name}") from exc
    return now_utc.astimezone(zone)


def campaign_day_start_utc(now_utc: datetime, timezone_name: str) -> str:
    local_now = campaign_local_datetime(now_utc, timezone_name)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_start.astimezone(timezone.utc).isoformat()


def campaign_week_bounds_utc(
    now_utc: datetime,
    timezone_name: str,
) -> tuple[str, str]:
    local_now = campaign_local_datetime(now_utc, timezone_name)
    local_week_start = (
        local_now - timedelta(days=local_now.weekday())
    ).replace(hour=0, minute=0, second=0, microsecond=0)
    local_week_end = local_week_start + timedelta(days=7)
    return (
        local_week_start.astimezone(timezone.utc).isoformat(),
        local_week_end.astimezone(timezone.utc).isoformat(),
    )


@lru_cache(maxsize=10000)
def timezone_from_coordinates(latitude: float, longitude: float) -> str:
    return TIMEZONE_FINDER.timezone_at(lat=latitude, lng=longitude) or ""


COUNTRY_TIMEZONE_FALLBACKS = {
    "fr": "Europe/Paris", "france": "Europe/Paris",
    "de": "Europe/Berlin", "germany": "Europe/Berlin",
    "it": "Europe/Rome", "italy": "Europe/Rome",
    "nl": "Europe/Amsterdam", "netherlands": "Europe/Amsterdam",
    "pl": "Europe/Warsaw", "poland": "Europe/Warsaw",
    "es": "Europe/Madrid", "spain": "Europe/Madrid",
    "ch": "Europe/Zurich", "switzerland": "Europe/Zurich",
    "be": "Europe/Brussels", "belgium": "Europe/Brussels",
    "at": "Europe/Vienna", "austria": "Europe/Vienna",
    "cz": "Europe/Prague", "czechia": "Europe/Prague", "czech republic": "Europe/Prague",
    "sk": "Europe/Bratislava", "slovakia": "Europe/Bratislava",
    "hu": "Europe/Budapest", "hungary": "Europe/Budapest",
    "ro": "Europe/Bucharest", "romania": "Europe/Bucharest",
    "pt": "Europe/Lisbon", "portugal": "Europe/Lisbon",
    "dk": "Europe/Copenhagen", "denmark": "Europe/Copenhagen",
    "se": "Europe/Stockholm", "sweden": "Europe/Stockholm",
    "no": "Europe/Oslo", "norway": "Europe/Oslo",
    "fi": "Europe/Helsinki", "finland": "Europe/Helsinki",
    "gb": "Europe/London", "uk": "Europe/London", "united kingdom": "Europe/London",
    "ie": "Europe/Dublin", "ireland": "Europe/Dublin",
}

def country_timezone_fallback(lead: dict[str, Any]) -> str:
    for key in (lower(lead.get("country_iso2")), lower(lead.get("country"))):
        if key in COUNTRY_TIMEZONE_FALLBACKS:
            return COUNTRY_TIMEZONE_FALLBACKS[key]
    return ""

def resolve_timezone(lead: dict[str, Any]) -> str:
    stored = clean(lead.get("email_timezone")) or clean(lead.get("timezone_name"))
    if stored:
        try:
            ZoneInfo(stored)
            return stored
        except ZoneInfoNotFoundError:
            pass
    latitude = as_float(lead.get("latitude"), 999.0)
    longitude = as_float(lead.get("longitude"), 999.0)
    if -90 <= latitude <= 90 and -180 <= longitude <= 180:
        name = timezone_from_coordinates(round(latitude, 6), round(longitude, 6))
        if name:
            try:
                ZoneInfo(name)
                return name
            except ZoneInfoNotFoundError:
                pass
    fallback = country_timezone_fallback(lead)
    if fallback:
        try:
            ZoneInfo(fallback)
            return fallback
        except ZoneInfoNotFoundError:
            pass
    return ""

def inside_send_window(
    local_dt: datetime,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    send_windows: tuple[tuple[int, int], ...] = (),
) -> bool:
    if local_dt.weekday() not in weekdays:
        return False
    if send_windows:
        return any(start <= local_dt.hour < end for start, end in send_windows)
    if start_hour == end_hour:
        return True
    if start_hour < end_hour:
        return start_hour <= local_dt.hour < end_hour
    return local_dt.hour >= start_hour or local_dt.hour < end_hour


def fetch_campaign(db: Client, campaign_name: str) -> dict[str, Any]:
    response = (
        db.table("email_campaigns")
        .select("*")
        .eq("name", campaign_name)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(f"No active campaign found named: {campaign_name}")
    campaign = rows[0]
    if not clean(campaign.get("id")):
        raise RuntimeError("Active campaign has no ID")
    if as_int(campaign.get("daily_limit"), 0) < 1:
        raise RuntimeError("Campaign daily_limit must be at least 1")
    if as_int(campaign.get("batch_size"), 0) < 1:
        raise RuntimeError("Campaign batch_size must be at least 1")
    return campaign


def count_sent_today(db: Client, campaign_id: str, now_utc: datetime, campaign_tz: str) -> int:
    response = (
        db.table("email_messages")
        .select("id,subject")
        .eq("campaign_id", campaign_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", campaign_day_start_utc(now_utc, campaign_tz))
        .execute()
    )
    return sum(
        1
        for row in (response.data or [])
        if not clean(row.get("subject")).upper().startswith("[DRY RUN")
    )


def count_country_sent_today(
    db: Client,
    campaign_id: str,
    now_utc: datetime,
    campaign_tz: str,
    countries: set[str],
) -> int:
    day_start = campaign_day_start_utc(now_utc, campaign_tz)
    message_response = (
        db.table("email_messages")
        .select("lead_id,subject")
        .eq("campaign_id", campaign_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", day_start)
        .execute()
    )
    messages = [
        row
        for row in (message_response.data or [])
        if not clean(row.get("subject")).upper().startswith("[DRY RUN")
    ]
    lead_ids = sorted({clean(row.get("lead_id")) for row in messages if clean(row.get("lead_id"))})
    if not lead_ids:
        return 0

    lead_response = (
        db.table("leads")
        .select("lead_id,country")
        .in_("lead_id", lead_ids)
        .execute()
    )
    country_by_lead = {
        clean(row.get("lead_id")): normalize_country(row.get("country"))
        for row in (lead_response.data or [])
    }
    return sum(
        1
        for row in messages
        if country_by_lead.get(clean(row.get("lead_id"))) in countries
    )


def count_country_sent_this_week(
    db: Client,
    campaign_id: str,
    now_utc: datetime,
    campaign_tz: str,
    countries: set[str],
) -> int:
    week_start, week_end = campaign_week_bounds_utc(now_utc, campaign_tz)
    message_response = (
        db.table("email_messages")
        .select("lead_id,subject")
        .eq("campaign_id", campaign_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", week_start)
        .lt("sent_at", week_end)
        .execute()
    )
    messages = [
        row
        for row in (message_response.data or [])
        if not clean(row.get("subject")).upper().startswith("[DRY RUN")
    ]
    lead_ids = sorted({clean(row.get("lead_id")) for row in messages if clean(row.get("lead_id"))})
    if not lead_ids:
        return 0

    lead_response = (
        db.table("leads")
        .select("lead_id,country")
        .in_("lead_id", lead_ids)
        .execute()
    )
    country_by_lead = {
        clean(row.get("lead_id")): normalize_country(row.get("country"))
        for row in (lead_response.data or [])
    }
    return sum(
        1
        for row in messages
        if country_by_lead.get(clean(row.get("lead_id"))) in countries
    )


def subject_key(value: Any) -> str:
    """Normalize a subject for exact duplicate protection across languages."""
    return normalize_country(value)


def recent_sent_subject_keys(
    db: Client,
    campaign_id: str,
    now_utc: datetime,
    lookback_days: int,
) -> set[str]:
    cutoff = (now_utc - timedelta(days=max(1, lookback_days))).isoformat()
    response = (
        db.table("email_messages")
        .select("subject")
        .eq("campaign_id", campaign_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", cutoff)
        .execute()
    )
    return {
        subject_key(row.get("subject"))
        for row in (response.data or [])
        if subject_key(row.get("subject"))
        and not clean(row.get("subject")).upper().startswith("[DRY RUN")
    }


def _customer_copy_from_sent_body(value: Any) -> str:
    text = clean(value).replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", text) if part.strip()]
    if not paragraphs:
        return ""
    if _looks_like_generated_greeting(paragraphs[0]):
        paragraphs = paragraphs[1:]
    # Export first-touch copy is two customer-facing paragraphs. Stop before the
    # protected signature/opt-out even when older messages contain extra blocks.
    return "\n\n".join(paragraphs[:2])


def recent_sent_drafts(
    db: Client,
    campaign_id: str,
    now_utc: datetime,
    *,
    lookback_days: int = 30,
    limit: int = 12,
) -> list[EmailDraft]:
    cutoff = (now_utc - timedelta(days=max(1, lookback_days))).isoformat()
    response = (
        db.table("email_messages")
        .select("subject,body_text")
        .eq("campaign_id", campaign_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .gte("sent_at", cutoff)
        .order("sent_at", desc=True)
        .limit(max(1, limit))
        .execute()
    )
    drafts: list[EmailDraft] = []
    for row in response.data or []:
        subject = safe_prompt_text(row.get("subject"), 160)
        body = _customer_copy_from_sent_body(row.get("body_text"))
        if subject and body:
            drafts.append(EmailDraft(subject=subject, body=body, language_name="English"))
    return drafts


def recent_copy_prompt_context(drafts: list[EmailDraft], max_examples: int = 8) -> str:
    if not drafts:
        return "No recent campaign copy is available."
    blocks = []
    for index, draft in enumerate(drafts[:max_examples], start=1):
        blocks.append(f"RECENT {index}\nSubject: {draft.subject}\nBody: {draft.body}")
    return "\n\n".join(blocks)


def _subject_with_suffix(base: str, suffix: str, limit: int = 100) -> str:
    base = " ".join(clean(base).replace("\r", " ").replace("\n", " ").split())
    suffix = " ".join(clean(suffix).replace("\r", " ").replace("\n", " ").split())
    if not suffix:
        return safe_prompt_text(base, limit)
    separator = " — "
    available = max(3, limit - len(separator) - len(suffix))
    trimmed = base[:available].rstrip(" -—:;,. ")
    return safe_prompt_text(f"{trimmed}{separator}{suffix}", limit)


def ensure_unique_subject(draft: EmailDraft, lead: dict[str, Any], research: CompanyResearch, used_subject_keys: set[str]) -> EmailDraft:
    """Preserve the model subject; copy policy lives in Supabase, not Python templates."""
    del lead, research, used_subject_keys
    subject = safe_prompt_text(draft.subject, 100)
    if not subject:
        raise RuntimeError("Generated subject is empty")
    return draft.model_copy(update={"subject": subject})


def is_consumer_email(email: Any) -> bool:
    return email_domain(lower(email)) in CONSUMER_EMAIL_DOMAINS


def decision_maker_evidence(lead: dict[str, Any]) -> bool:
    """Require company and role evidence before using a consumer mailbox."""
    contact_name = contact_greeting_name(lead)
    role = (
        clean(lead.get("contact_job_title"))
        or clean(lead.get("contact_department"))
        or clean(lead.get("contact_seniority"))
    )
    company_context = (
        clean(lead.get("website"))
        or clean(lead.get("company_domain"))
        or clean(lead.get("parent_company"))
    )
    return bool(contact_name and role and company_context)


def status_priority(lead: dict[str, Any]) -> int:
    """Return a sendable quality score; zero is reserved for hard blocks."""
    status = lower(lead.get("email_status"))

    if status and any(fragment in status for fragment in BLOCKED_EMAIL_STATUS_FRAGMENTS):
        return 0

    if as_bool(lead.get("email_verified")):
        return 800

    # Blank or unfamiliar statuses are the lowest quality tier, not an
    # automatic rejection. Syntax and MX validation still run before sending.
    return EMAIL_STATUS_PRIORITY.get(status, LOWEST_UNKNOWN_STATUS_PRIORITY)

def negative_fit(lead: dict[str, Any]) -> bool:
    text = " ".join(
        lower(lead.get(field))
        for field in (
            "pvc_fit_status", "gold_split_reason",
            "enrichment_fit_decision", "enrichment_fit_reason",
        )
    )
    return any(term in text for term in NEGATIVE_FIT_TERMS)


def mailbox_raw_local_part(email: Any) -> str:
    recipient = lower(email)
    if "@" not in recipient:
        return ""
    return recipient.split("@", 1)[0]


def mailbox_local_part(email: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", mailbox_raw_local_part(email))


def mailbox_tokens(email: Any) -> set[str]:
    raw = normalize_country(mailbox_raw_local_part(email))
    compact = re.sub(r"[^a-z0-9]", "", raw)
    tokens = set(re.findall(r"[a-z0-9]+", raw))
    if compact:
        tokens.add(compact)
    return tokens


def token_present(tokens: set[str], vocabulary: set[str]) -> bool:
    for token in tokens:
        for keyword in vocabulary:
            if token == keyword or token.endswith(keyword) or token.startswith(keyword):
                return True
    return False


def mailbox_matches_location(lead: dict[str, Any]) -> bool:
    local = mailbox_local_part(lead.get("email"))
    if not local:
        return False
    for field in ("city", "admin_level_1", "admin_level_2", "state"):
        location = re.sub(r"[^a-z0-9]", "", normalize_country(lead.get(field)))
        if len(location) < 4:
            continue
        if local == location or re.fullmatch(rf".*{re.escape(location)}\d*", local):
            return True
    return False


def mailbox_tier(lead: dict[str, Any]) -> int:
    """Return 1 (best) through 4 (last resort)."""
    tokens = mailbox_tokens(lead.get("email"))
    if not tokens:
        return 99
    if token_present(tokens, TIER_4_LAST_RESORT_TOKENS):
        return 4
    if mailbox_matches_location(lead):
        return 4
    if token_present(tokens, TIER_3_GENERAL_TOKENS):
        return 3
    if token_present(tokens, TIER_2_BUSINESS_TOKENS):
        return 2
    if token_present(tokens, TIER_1_BUYER_TOKENS):
        return 1
    raw = mailbox_raw_local_part(lead.get("email"))
    # Two-part company-domain addresses usually represent a named person.
    if re.fullmatch(r"[a-z]{2,}[._-][a-z]{2,}", raw):
        return 1
    # A single-word alias is Tier 1 only when the database links it to a person/role.
    contact_text = normalize_country(" ".join([
        clean(lead.get("contact_first_name")), clean(lead.get("contact_last_name")),
        clean(lead.get("contact_name")), clean(lead.get("contact_job_title")),
    ]))
    local = mailbox_local_part(lead.get("email"))
    contact_tokens = [token for token in re.findall(r"[a-z0-9]+", contact_text) if len(token) >= 3]
    if re.fullmatch(r"[a-z]{4,}", raw) and any(token in local for token in contact_tokens):
        return 1
    return 3


def mailbox_tier_label(lead: dict[str, Any]) -> str:
    return {
        1: "Tier 1 named/buyer contact",
        2: "Tier 2 business department",
        3: "Tier 3 general company inbox",
        4: "Tier 4 last-resort routing inbox",
    }.get(mailbox_tier(lead), "unusable mailbox")


def buyer_mailbox_acceptable(lead: dict[str, Any]) -> tuple[bool, str]:
    """Allow all four waterfall tiers; reject only an unusable local part."""
    tier = mailbox_tier(lead)
    if tier == 99:
        return False, "missing mailbox local part"
    return True, mailbox_tier_label(lead)


def contact_name_safe_for_email(lead: dict[str, Any]) -> bool:
    """Use a person's name only when the mailbox plausibly belongs to that person."""
    local_part = mailbox_local_part(lead.get("email"))
    if not local_part or mailbox_tier(lead) > 1:
        return False

    names = [
        safe_prompt_text(lead.get("contact_first_name"), 60),
        safe_prompt_text(lead.get("contact_last_name"), 60),
        safe_prompt_text(lead.get("contact_full_name"), 100),
    ]
    tokens: set[str] = set()
    for value in names:
        for token in re.findall(r"[a-z0-9]+", normalize_country(value)):
            if len(token) >= 3:
                tokens.add(token)
    if tokens and any(token in local_part for token in tokens):
        return True

    # Some verified named mailboxes compact the person's first name and last
    # initial (for example Ben Fowles -> benf@...).  Supabase already stores
    # explicit named-person provenance for these rows, so retain the greeting
    # when the local part starts with the complete first name.  Generic inboxes
    # never reach this branch because they are not Tier 1.
    first_name = normalize_country(safe_prompt_text(lead.get("contact_first_name"), 60))
    named_evidence = normalize_country(" ".join([
        clean(lead.get("contact_scope")),
        clean(lead.get("email_source")),
        clean(lead.get("decision_email_class")),
    ]))
    explicit_named_contact = any(
        marker in named_evidence
        for marker in ("named", "direct key person", "direct key-person")
    )
    return bool(
        explicit_named_contact
        and len(first_name) >= 3
        and local_part.startswith(first_name)
    )


def email_is_generic_company_inbox(value: Any) -> bool:
    """Return True for role/general inboxes such as sales@, info@ and contact@."""
    email = lower(value)
    if not valid_email(email):
        return False
    tokens = mailbox_tokens(email)
    return bool(tokens and any(token in GENERIC_MAILBOX_LOCAL_PARTS for token in tokens))


def preferred_recipient_lead(lead: dict[str, Any]) -> dict[str, Any]:
    """Prefer a named person's email over the company inbox when both exist.

    The returned row is an in-memory view only; Supabase data is not rewritten here.
    Primary named contact wins, then a named address already stored in ``email``, then
    a secondary named contact, and only then the original company mailbox.
    """
    view = dict(lead)
    original_email = lower(lead.get("email"))
    personal_email = lower(lead.get("personal_email"))
    secondary_email = lower(lead.get("secondary_contact_email"))
    decision_class = lower(lead.get("decision_email_class"))

    choices: list[tuple[str, str]] = []
    if valid_email(personal_email) and not email_is_generic_company_inbox(personal_email):
        choices.append((personal_email, "primary_contact_email"))
    if valid_email(original_email) and (
        decision_class == "named_work_email" or not email_is_generic_company_inbox(original_email)
    ):
        choices.append((original_email, "lead_email_named_or_direct"))
    if valid_email(secondary_email) and not email_is_generic_company_inbox(secondary_email):
        choices.append((secondary_email, "secondary_contact_email"))
    if valid_email(original_email):
        choices.append((original_email, "company_email_fallback"))

    if not choices:
        return view

    selected, source = choices[0]
    view["email"] = selected
    view["_recipient_source"] = source
    if selected != original_email and original_email:
        view["_company_email_fallback"] = original_email
        # The original company inbox may have its own bounce/status history. Do not
        # let that status suppress a different named-contact mailbox.
        if any(fragment in lower(lead.get("email_status")) for fragment in BLOCKED_EMAIL_STATUS_FRAGMENTS):
            view["email_status"] = "existing_source_unverified"
            view["email_verified"] = False
            view["email_verification_status"] = "source_only_unverified"

    if source == "secondary_contact_email":
        secondary_name = safe_prompt_text(lead.get("secondary_contact_full_name"), 100)
        if secondary_name:
            view["contact_full_name"] = secondary_name
            parts = secondary_name.split()
            view["contact_first_name"] = parts[0] if parts else ""
            view["contact_last_name"] = parts[-1] if len(parts) > 1 else ""

    return view


def eligible(
    lead: dict[str, Any],
    sender_email: str,
    expand_to_all_not_contacted: bool,
) -> tuple[bool, str]:
    recipient = lower(lead.get("email"))
    if not clean(lead.get("lead_id")):
        return False, "missing lead_id"
    if not clean(lead.get("name")):
        return False, "missing company name"
    if not recipient or not valid_email(recipient):
        return False, "invalid or missing email"
    if recipient == sender_email.lower():
        return False, "recipient equals sender"
    if is_consumer_email(recipient) and not decision_maker_evidence(lead):
        return False, "consumer mailbox without named decision-maker and role evidence"
    mailbox_ok, mailbox_reason = buyer_mailbox_acceptable(lead)
    if not mailbox_ok:
        return False, mailbox_reason
    if as_bool(lead.get("do_not_contact")):
        return False, "do_not_contact is true"
    if not expand_to_all_not_contacted and not as_bool(lead.get("ai_outreach_enabled")):
        return False, "outreach not enabled"
    if lower(lead.get("ai_outreach_status")) != "not_contacted":
        return False, "lead already processed"
    if lower(lead.get("market")) == "internal_test":
        return False, "internal test lead"
    if status_priority(lead) <= 0:
        return False, "email status is not sendable"
    if negative_fit(lead):
        return False, "negative flooring fit"
    return True, "eligible"


def fetch_candidate_leads(
    db: Client,
    expand_to_all_not_contacted: bool,
    page_size: int = 1000,
    maximum_rows: int = 10000,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while offset < maximum_rows:
        end = min(offset + page_size - 1, maximum_rows - 1)
        query = (
            db.table("leads")
            .select("*")
            .eq("do_not_contact", False)
            .eq("ai_outreach_status", "not_contacted")
        )
        if not expand_to_all_not_contacted:
            query = query.eq("ai_outreach_enabled", True)
        response = (
            query
            .order("b2b_score", desc=True)
            .order("email_confidence", desc=True)
            .order("lead_id")
            .range(offset, end)
            .execute()
        )
        page = response.data or []
        if not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return attach_live_buying_rank(db, rows)


def attach_live_buying_rank(db: Client, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Overlay the live buying rank used by the admin Manual Reach view."""
    if not rows:
        return rows
    try:
        response = db.rpc("platform_lead_buying_rank_current", {}).execute()
        rank_rows = response.data or []
        by_id = {clean(row.get("lead_id")): row for row in rank_rows if clean(row.get("lead_id"))}
        for lead in rows:
            rank = by_id.get(clean(lead.get("lead_id")))
            if not rank:
                continue
            lead["_buying_likelihood_score"] = as_int(rank.get("buying_likelihood_score"), as_int(lead.get("b2b_score"), 0))
            lead["_dynamic_fair_priority"] = as_int(rank.get("fair_priority"), 9)
            lead["_company_contact_rank"] = as_int(rank.get("company_contact_rank"), 999999)
            lead["_company_key"] = clean(rank.get("company_key"))
        return rows
    except Exception as exc:
        print("Live buying-rank RPC unavailable; using stored lead ranking:", clean(exc)[:220])
        return rows


def buying_likelihood_score(lead: dict[str, Any]) -> float:
    value = lead.get("_buying_likelihood_score")
    if value is None:
        value = lead.get("b2b_score")
    return as_float(value, 0.0)


def dynamic_fair_priority(lead: dict[str, Any]) -> int:
    value = as_int(lead.get("_dynamic_fair_priority"), 0)
    if 1 <= value <= 9:
        return value
    stored = as_int(lead.get("fair_priority"), 0)
    return stored if 1 <= stored <= 9 else 9


def company_contact_rank(lead: dict[str, Any]) -> int:
    value = as_int(lead.get("_company_contact_rank"), 0)
    return value if value > 0 else 999999


def configured_country_priority_rank(lead: dict[str, Any], priority_countries: tuple[str, ...]) -> int:
    """Use the ordered Manual Reach country priority stored in Supabase."""
    if not priority_countries:
        return 0
    country = normalize_country_key(lead.get("country"))
    try:
        return priority_countries.index(country)
    except ValueError:
        return len(priority_countries)


def configured_priority_sort_key(
    item: tuple[dict[str, Any], str, datetime],
    priority_countries: tuple[str, ...],
) -> tuple[Any, ...]:
    """Mirror Manual Reach: configured country order, then live lead quality."""
    lead, _, local_dt = item
    return (
        configured_country_priority_rank(lead, priority_countries),
        -buying_likelihood_score(lead),
        dynamic_fair_priority(lead),
        company_contact_rank(lead),
        -strategic_priority_score(lead),
        local_dt,
        clean(lead.get("lead_id")),
    )


def _parse_queue_timestamp(value: Any) -> datetime | None:
    raw = clean(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _manual_retry_already_attempted_today(
    request: dict[str, Any],
    local_dt: datetime,
) -> bool:
    """Throttle retryable manual rows to one attempt per recipient-local day."""
    if not lower(request.get("error_message")).startswith("retry:"):
        return False
    last_attempt = _parse_queue_timestamp(request.get("updated_at") or request.get("started_at"))
    if not last_attempt:
        return False
    try:
        return last_attempt.astimezone(local_dt.tzinfo).date() == local_dt.date()
    except Exception:
        return False


def manual_lead_request_due_now(
    lead: dict[str, Any],
    request: dict[str, Any],
    now_utc: datetime,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    run_force_local_window: bool = False,
    send_windows: tuple[tuple[int, int], ...] = (),
) -> tuple[bool, str]:
    """Return whether a queued manual lead is due now without consuming it."""
    timezone_name = resolve_timezone(lead)
    if not timezone_name:
        return False, "terminal: recipient timezone unavailable"
    try:
        local_dt = now_utc.astimezone(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError:
        return False, "terminal: recipient timezone unavailable"

    if _manual_retry_already_attempted_today(request, local_dt):
        return False, f"waiting: retry already attempted today ({timezone_name} {local_dt:%Y-%m-%d})"

    if run_force_local_window or as_bool(request.get("force_local_window")):
        source = "manual workflow override" if run_force_local_window else "queued request override"
        return True, f"force-local-window bypass ({source})"
    if not inside_send_window(local_dt, start_hour, end_hour, weekdays, send_windows):
        return False, f"waiting for recipient local window ({timezone_name} {local_dt:%Y-%m-%d %H:%M})"
    return True, f"due now ({timezone_name} {local_dt:%Y-%m-%d %H:%M})"


def claim_manual_lead_outreach_request(
    db: Client,
    now_utc: datetime,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    scan_limit: int,
    stale_processing_hours: int,
    run_force_local_window: bool = False,
    send_windows: tuple[tuple[int, int], ...] = (),
) -> dict[str, Any] | None:
    """Claim the oldest currently-sendable Manual Reach request."""
    try:
        stale_before = (now_utc - timedelta(hours=stale_processing_hours)).isoformat()
        try:
            (
                db.table("manual_promotion_queue")
                .update({
                    "status": "queued",
                    "started_at": None,
                    "completed_at": None,
                    "error_message": "retry: recovered after stale processing claim",
                    "updated_at": now_utc.isoformat(),
                })
                .eq("campaign_key", "lead_outreach")
                .eq("status", "processing")
                .lt("started_at", stale_before)
                .execute()
            )
        except Exception:
            pass
        response = (
            db.table("manual_promotion_queue")
            .select("*")
            .eq("campaign_key", "lead_outreach")
            .eq("status", "queued")
            .order("requested_at")
            .limit(scan_limit)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None

        lead_ids = [clean(row.get("lead_id")) for row in rows if clean(row.get("lead_id"))]
        leads_by_id: dict[str, dict[str, Any]] = {}
        if lead_ids:
            try:
                lead_response = db.table("leads").select("*").in_("lead_id", lead_ids).execute()
                leads_by_id = {clean(lead.get("lead_id")): lead for lead in (lead_response.data or [])}
            except Exception:
                for lead_id in lead_ids:
                    try:
                        one = db.table("leads").select("*").eq("lead_id", lead_id).limit(1).execute()
                        if one.data:
                            leads_by_id[lead_id] = one.data[0]
                    except Exception:
                        continue

        for row in rows:
            lead_id = clean(row.get("lead_id"))
            lead = leads_by_id.get(lead_id)
            if not lead:
                print("Manual Reach queue waiting:", lead_id, "lead record unavailable")
                continue
            due, reason = manual_lead_request_due_now(
                lead,
                row,
                now_utc,
                start_hour,
                end_hour,
                weekdays,
                run_force_local_window=run_force_local_window,
                send_windows=send_windows,
            )
            if not due:
                if lower(reason).startswith("terminal:"):
                    db.table("manual_promotion_queue").update({
                        "status": "failed",
                        "completed_at": now_utc.isoformat(),
                        "error_message": reason,
                        "updated_at": now_utc.isoformat(),
                    }).eq("id", clean(row.get("id"))).eq("status", "queued").execute()
                    print("Manual Reach queue terminal stop:", lead_id, reason)
                    continue
                print("Manual Reach queue deferred:", lead_id, reason)
                continue
            claimed = (
                db.table("manual_promotion_queue")
                .update({
                    "status": "processing",
                    "started_at": now_utc.isoformat(),
                    "completed_at": None,
                    "error_message": None,
                    "updated_at": now_utc.isoformat(),
                })
                .eq("id", clean(row.get("id")))
                .eq("status", "queued")
                .execute()
            )
            if not (claimed.data or []):
                continue
            row["status"] = "processing"
            row["updated_at"] = now_utc.isoformat()
            print("Manual Reach queue due:", lead_id, reason)
            return row
        return None
    except Exception as exc:
        print("Manual lead-outreach queue unavailable for this run:", clean(exc)[:220])
        return None


def claim_manual_lead_outreach_requests(
    db: Client,
    now_utc: datetime,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    scan_limit: int,
    stale_processing_hours: int,
    maximum: int,
    run_force_local_window: bool = False,
    send_windows: tuple[tuple[int, int], ...] = (),
) -> list[dict[str, Any]]:
    """Claim all currently due manual rows up to this run's remaining capacity."""
    claimed: list[dict[str, Any]] = []
    for _ in range(max(0, maximum)):
        row = claim_manual_lead_outreach_request(
            db,
            now_utc,
            start_hour,
            end_hour,
            weekdays,
            scan_limit,
            stale_processing_hours,
            run_force_local_window=run_force_local_window,
            send_windows=send_windows,
        )
        if not row:
            break
        claimed.append(row)
    return claimed


def manual_lead_hard_stop_reason(
    lead: dict[str, Any],
    sender_email: str,
) -> str:
    """Return only terminal safety reasons for a manually selected lead."""
    recipient = lower(lead.get("email"))
    if not clean(lead.get("lead_id")):
        return "terminal: missing lead_id"
    if not recipient or not valid_email(recipient):
        return "terminal: invalid or missing recipient email"
    if recipient == sender_email.lower():
        return "terminal: recipient equals sender"
    if as_bool(lead.get("do_not_contact")):
        return "terminal: do_not_contact is true"
    if clean(lead.get("last_reply_at")):
        return "terminal: lead already replied; manual human handling required"
    if lower(lead.get("market")) == "internal_test":
        return "terminal: internal test lead"
    status_text = lower(
        " ".join(
            clean(lead.get(field))
            for field in (
                "email_bounce_status",
                "email_status",
                "decision_email_status",
                "email_verification_status",
            )
        )
    )
    if any(token in status_text for token in ("bounce", "invalid", "undeliverable", "rejected", "suppressed")):
        return "terminal: recipient mailbox is marked bounced/invalid"
    return ""


def build_manual_lead_candidate(
    db: Client,
    request: dict[str, Any],
    now_utc: datetime,
    sender_email: str,
) -> tuple[tuple[dict[str, Any], str, datetime] | None, str]:
    """Build the requested lead directly, bypassing automated ranking/fit gates."""
    lead_id = clean(request.get("lead_id"))
    try:
        response = db.table("leads").select("*").eq("lead_id", lead_id).limit(1).execute()
        if not response.data:
            return None, "retry: lead record is temporarily unavailable"
        lead = preferred_recipient_lead(response.data[0])
    except Exception as exc:
        return None, f"retry: lead lookup failed: {clean(exc)[:300]}"

    hard_stop = manual_lead_hard_stop_reason(lead, sender_email)
    if hard_stop:
        return None, hard_stop

    timezone_name = resolve_timezone(lead)
    if not timezone_name:
        return None, "retry: recipient timezone unavailable"
    try:
        local_dt = now_utc.astimezone(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError:
        return None, "retry: recipient timezone unavailable"
    return (lead, timezone_name, local_dt), ""


def defer_manual_lead_outreach_request(
    db: Client,
    request: dict[str, Any] | None,
    reason: str,
) -> None:
    """Return a claimed Manual Reach row to queued for a retryable soft stop."""
    if not request or not clean(request.get("id")):
        return
    reason_text = clean(reason)[:1180] or "retryable manual stop"
    if not lower(reason_text).startswith("retry:"):
        reason_text = f"retry: {reason_text}"
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "queued",
        "started_at": None,
        "completed_at": None,
        "recipient_email": None,
        "error_message": reason_text,
        "updated_at": now_iso,
    }
    try:
        (
            db.table("manual_promotion_queue")
            .update(payload)
            .eq("id", clean(request.get("id")))
            .eq("status", "processing")
            .execute()
        )
    except Exception as exc:
        print("WARNING: manual lead-outreach defer failed:", clean(exc)[:220])


def finish_manual_lead_outreach_request(
    db: Client,
    request: dict[str, Any] | None,
    status: str,
    recipient_email: str = "",
    error_message: str = "",
) -> None:
    if not request or not clean(request.get("id")):
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": status,
        "completed_at": now_iso,
        "recipient_email": lower(recipient_email) or None,
        "error_message": clean(error_message)[:1200] or None,
        "updated_at": now_iso,
    }
    try:
        db.table("manual_promotion_queue").update(payload).eq("id", clean(request.get("id"))).execute()
    except Exception as exc:
        print("WARNING: manual lead-outreach queue status update failed:", clean(exc)[:220])


def normalize_country(value: Any) -> str:
    """Normalize country labels without requiring an extra dependency."""
    text = lower(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def commercial_evidence_text(lead: dict[str, Any]) -> str:
    """Combine only existing lead evidence used for pre-research commercial ranking."""
    return normalize_country(
        " ".join(clean(lead.get(field)) for field in COMMERCIAL_EVIDENCE_FIELDS)
    )


def phrase_present(text: str, phrases: set[str]) -> bool:
    normalized = f" {normalize_country(text)} "
    return any(f" {normalize_country(phrase)} " in normalized for phrase in phrases)


def container_import_evidence_score(lead: dict[str, Any]) -> int:
    """Return 0-3 without promoting noisy enrichment notes to Tier 1."""
    broad_text = commercial_evidence_text(lead)
    readiness = normalize_country(lead.get("container_readiness"))
    negative_readiness = phrase_present(
        readiness,
        {"not confirmed", "unconfirmed", "not ready", "unknown", "possible", "unclear"},
    )
    if not negative_readiness and phrase_present(
        readiness,
        {"confirmed", "container ready", "active importer", "direct importer"},
    ):
        return 3

    direct_import_text = normalize_country(" ".join([
        clean(lead.get("import_history")),
        clean(lead.get("import_status")),
        clean(lead.get("import_notes")),
    ]))
    if phrase_present(direct_import_text, IMPORTER_TERMS | WHOLESALE_TERMS):
        return 3

    classified_buyer_text = normalize_country(" ".join([
        clean(lead.get("buyer_type")),
        clean(lead.get("company_type")),
        clean(lead.get("organization_type")),
    ]))
    if phrase_present(classified_buyer_text, IMPORTER_TERMS | WHOLESALE_TERMS):
        return 2
    if phrase_present(broad_text, DISTRIBUTOR_CHAIN_TERMS):
        return 1
    return 0


def commercial_target_tier(lead: dict[str, Any]) -> int:
    """Rank company value before mailbox quality: 1 best, 5 lowest priority."""
    text = commercial_evidence_text(lead)
    import_score = container_import_evidence_score(lead)
    # Tier 1 now requires dedicated importer/wholesaler/container evidence. A
    # generic enrichment sentence containing the word "importer" is not enough.
    if import_score >= 3:
        return 1
    if import_score == 2:
        # A dataset buyer-type label needs corroboration. High B2B evidence or
        # explicit company scale keeps strong importers ahead, while low-score
        # showroom records no longer monopolize the Tier 1 queue.
        if as_float(lead.get("b2b_score"), 0.0) >= 85 or company_scale_score(lead) >= 2:
            return 1
        return 2
    if phrase_present(text, DISTRIBUTOR_CHAIN_TERMS):
        return 2
    # A named parent or multiple locations is explicit scale evidence for a chain/group.
    if clean(lead.get("parent_company")) or any(
        as_int(lead.get(field), 0) >= 2
        for field in ("branch_count", "store_count", "location_count")
    ):
        return 2
    if phrase_present(text, PROJECT_CHANNEL_TERMS):
        return 3
    # Installer evidence must be checked before the broad retail fallback.
    if phrase_present(text, INSTALLER_TERMS):
        return 5
    if phrase_present(text, RETAIL_TERMS):
        return 4
    score = as_float(lead.get("b2b_score"), 0.0)
    return 3 if score >= 70 else 4


def contact_authority_tier(lead: dict[str, Any]) -> int:
    """Prioritize purchasing authority, then executives, then other named contacts."""
    text = normalize_country(" ".join([
        clean(lead.get("contact_job_title")), clean(lead.get("contact_department")),
        clean(lead.get("contact_seniority")), mailbox_raw_local_part(lead.get("email")),
    ]))
    if phrase_present(text, PURCHASING_ROLE_TERMS):
        return 1
    if phrase_present(text, EXECUTIVE_ROLE_TERMS):
        return 2
    if phrase_present(text, CATEGORY_ROLE_TERMS):
        return 3
    tier = mailbox_tier(lead)
    if tier == 1:
        return 4
    if tier == 2:
        return 5
    return 6


def company_scale_score(lead: dict[str, Any]) -> int:
    """Use explicit chain/parent/branch evidence only; never infer turnover or volume."""
    text = commercial_evidence_text(lead)
    score = 0
    if clean(lead.get("parent_company")):
        score += 3
    if phrase_present(text, {"national", "international", "multi branch", "multi location", "chain", "network", "filiales", "succursales", "oddzial"}):
        score += 3
    for field in ("branch_count", "store_count", "location_count", "employee_count"):
        value = as_int(lead.get(field), 0)
        if value >= 10:
            score += 3
        elif value >= 2:
            score += 1
    return score


def research_evidence_text(research: "CompanyResearch") -> str:
    return normalize_country(" ".join([
        research.buyer_type,
        research.business_model,
        " ".join(research.verified_facts),
        research.recommended_angle,
        research.commercial_interpretation,
    ]))


def research_scale_score(research: "CompanyResearch") -> int:
    """Score only scale explicitly visible in website research."""
    text = research_evidence_text(research)
    score = 0
    if phrase_present(text, RESEARCH_SCALE_TERMS):
        score += 2
    if phrase_present(text, PROFESSIONAL_DISTRIBUTION_TERMS):
        score += 1
    scale_nouns = (
        "agency|agencies|branch|branches|location|locations|store|stores|depot|depots|"
        "agence|agences|succursale|succursales|filiale|filiales|oddzial|oddzialy"
    )
    counts = [
        int(value)
        for value in re.findall(rf"\b(\d{{1,4}})\s+(?:{scale_nouns})\b", text)
    ]
    counts.extend(
        int(value)
        for value in re.findall(rf"\b(?:{scale_nouns})\s*[:=-]?\s*(\d{{1,4}})\b", text)
    )
    if any(value >= 5 for value in counts):
        score += 2
    elif any(value >= 2 for value in counts):
        score += 1
    return score


def research_target_tier(lead: dict[str, Any], research: "CompanyResearch") -> int:
    """Use website-confirmed buyer type; mixed showroom/distributors are not Tier 2."""
    buyer_type = normalize_country(research.buyer_type or "")
    business_model = normalize_country(research.business_model or "")
    evidence = research_evidence_text(research)

    # The explicit buyer_type returned by the structured research call is
    # authoritative. Supporting facts may refine scale, but cannot override an
    # explicit installer/retailer classification.
    if phrase_present(buyer_type, IMPORTER_TERMS | WHOLESALE_TERMS):
        return 1
    if "installer contractor" in buyer_type or "installer" in buyer_type:
        return 5
    if "project supplier" in buyer_type:
        return 3

    has_distributor = any(term in buyer_type for term in ("distributor", "distribution"))
    has_retail = (
        any(term in buyer_type for term in ("retailer", "showroom", "store", "online shop"))
        or phrase_present(evidence, RETAIL_TERMS)
    )
    if has_distributor:
        # A distributor is Tier 2 only when the website also proves scale or a
        # professional trade network. A local showroom using "distributor" is Tier 4.
        scale = research_scale_score(research)
        if scale >= 2 and not (has_retail and scale < 3):
            return 2
        if has_retail:
            return 4
        return 3
    if has_retail:
        return 4

    # When buyer_type is blank/unknown, use the broader website evidence as a
    # fallback, while still preferring low-risk classifications.
    if not buyer_type or buyer_type in {"unknown", "flooring business"}:
        if phrase_present(evidence, IMPORTER_TERMS | WHOLESALE_TERMS):
            return 1
        if phrase_present(evidence, INSTALLER_TERMS):
            return 5
        if phrase_present(evidence, RETAIL_TERMS):
            return 4
        if phrase_present(evidence, PROJECT_CHANNEL_TERMS):
            return 3
        if phrase_present(business_model, DISTRIBUTOR_CHAIN_TERMS):
            return 2 if research_scale_score(research) >= 2 else 3
    return commercial_target_tier(lead)


def sales_angle_key(research: "CompanyResearch") -> str:
    return normalize_country(research.selected_sales_angle or research.recommended_angle or "other")


def normalized_copy_for_similarity(draft: "EmailDraft") -> str:
    return normalize_country(f"{draft.subject} {draft.body}")


def draft_similarity(left: "EmailDraft", right: "EmailDraft") -> float:
    return SequenceMatcher(
        None,
        normalized_copy_for_similarity(left),
        normalized_copy_for_similarity(right),
        autojunk=False,
    ).ratio()



def candidate_key(
    item: tuple[dict[str, Any], str, datetime],
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    send_windows: tuple[tuple[int, int], ...] = (),
) -> tuple[Any, ...]:
    """Quality-first ordering with no country policy embedded in Python.

    Country restrictions and priority order are supplied by Supabase
    ``campaign_controls``.  This fallback key ranks only commercial quality,
    contact authority and sendability.
    """
    lead, _, local_dt = item
    consumer_penalty = 1 if is_consumer_email(lead.get("email")) else 0
    local_window_penalty = (
        0 if inside_send_window(local_dt, start_hour, end_hour, weekdays, send_windows) else 1
    )
    return (
        commercial_target_tier(lead),
        contact_authority_tier(lead),
        -container_import_evidence_score(lead),
        -company_scale_score(lead),
        -buying_likelihood_score(lead),
        dynamic_fair_priority(lead),
        company_contact_rank(lead),
        local_window_penalty,
        consumer_penalty,
        -status_priority(lead),
        -email_confidence_priority(lead.get("email_confidence")),
        mailbox_tier(lead),
        clean(lead.get("lead_id")),
    )


def local_time_candidates(
    db: Client,
    sender_email: str,
    now_utc: datetime,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    force_window: bool,
    expand_to_all_not_contacted: bool,
    preview_only: bool = False,
    target_countries: frozenset[str] = frozenset(),
    send_windows: tuple[tuple[int, int], ...] = (),
) -> list[tuple[dict[str, Any], str, datetime]]:
    candidates: list[tuple[dict[str, Any], str, datetime]] = []
    scanned = fetch_candidate_leads(db, expand_to_all_not_contacted)
    ineligible_count = 0
    missing_timezone_count = 0

    for raw_lead in scanned:
        lead = preferred_recipient_lead(raw_lead)
        if target_countries and normalize_country_key(lead.get("country")) not in target_countries:
            continue
        ok, reason = eligible(lead, sender_email, expand_to_all_not_contacted)
        if not ok:
            ineligible_count += 1
            print("Skipped:", clean(lead.get("lead_id")), reason)
            continue

        timezone_name = resolve_timezone(lead)
        if not timezone_name:
            missing_timezone_count += 1
            print("Skipped:", clean(lead.get("lead_id")), "timezone unavailable from dataset coordinates")
            continue

        try:
            local_dt = now_utc.astimezone(ZoneInfo(timezone_name))
        except ZoneInfoNotFoundError:
            missing_timezone_count += 1
            print("Skipped:", clean(lead.get("lead_id")), "timezone unavailable")
            continue
        if not force_window and not inside_send_window(
            local_dt, start_hour, end_hour, weekdays, send_windows
        ):
            continue
        candidates.append((lead, timezone_name, local_dt))

    candidates.sort(
        key=lambda item: candidate_key(item, start_hour, end_hour, weekdays, send_windows)
    )
    print("Candidate leads scanned:", len(scanned))
    print("Ineligible leads:", ineligible_count)
    print("Leads without timezone:", missing_timezone_count)
    print("Candidates in local window:", len(candidates))
    return candidates


def manual_queue_has_active(db: Client, campaign_key: str) -> bool:
    """Return True while any manual work is still queued/processing.

    Automatic outreach must not consume campaign capacity while manually selected
    work is pending.  If a manual item is waiting for a retry/local window the
    scheduled worker exits and leaves the daily slots reserved for it.
    """
    try:
        response = (
            db.table("manual_promotion_queue")
            .select("id")
            .eq("campaign_key", campaign_key)
            .in_("status", ["queued", "processing"])
            .limit(1)
            .execute()
        )
        return bool(response.data)
    except Exception as exc:
        print("WARNING: manual queue priority check unavailable; failing closed:", clean(exc)[:220])
        return True


def recent_send_for_lead(
    db: Client,
    lead_id: str,
    now_utc: datetime,
    cooldown_days: int,
) -> dict[str, Any] | None:
    """Return the latest confirmed send for a lead inside the configured cooldown."""
    cutoff = (now_utc - timedelta(days=max(1, cooldown_days))).isoformat()
    try:
        response = (
            db.table("email_messages")
            .select("id,campaign_id,sender_email,recipient_email,sent_at,status,provider")
            .eq("lead_id", clean(lead_id))
            .eq("direction", "outbound")
            .eq("status", "sent")
            .gte("sent_at", cutoff)
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:
        print("WARNING: recent-send safety lookup unavailable:", clean(exc)[:220])
        return None


def already_contacted(db: Client, recipient_email: str) -> bool:
    response = (
        db.table("email_messages")
        .select("id")
        .eq("recipient_email", recipient_email.lower())
        .eq("direction", "outbound")
        .eq("status", "sent")
        .limit(1)
        .execute()
    )
    return bool(response.data)


def normalized_company_domains(lead: dict[str, Any]) -> list[str]:
    domains: set[str] = set()
    recipient_domain = email_domain(lead.get("email"))
    if recipient_domain and recipient_domain not in CONSUMER_EMAIL_DOMAINS:
        domains.add(recipient_domain)

    raw_domain = clean(lead.get("company_domain"))
    if raw_domain:
        parsed = urlparse(raw_domain if "://" in raw_domain else f"https://{raw_domain}")
        host = lower(parsed.hostname or raw_domain).removeprefix("www.")
        if host and "." in host:
            domains.add(host)

    website = clean(lead.get("website"))
    if website:
        parsed = urlparse(website if "://" in website else f"https://{website}")
        host = lower(parsed.hostname).removeprefix("www.")
        if host and "." in host:
            domains.add(host)

    return sorted(domains)


def company_recently_contacted(
    db: Client,
    lead: dict[str, Any],
    now_utc: datetime,
    cooldown_days: int,
) -> bool:
    """Block a second address at the same company during the cooldown."""
    current_recipient = lower(lead.get("email"))
    cutoff = (now_utc - timedelta(days=max(1, cooldown_days))).isoformat()
    for domain in normalized_company_domains(lead):
        query = (
            db.table("email_messages")
            .select("id,recipient_email,sent_at")
            .eq("direction", "outbound")
            .eq("status", "sent")
            .gte("sent_at", cutoff)
            .ilike("recipient_email", f"%@{domain}")
        )
        if current_recipient:
            query = query.neq("recipient_email", current_recipient)
        response = query.limit(1).execute()
        if response.data:
            return True
    return False


def strategic_route_eligible(lead: dict[str, Any]) -> bool:
    """Automatic initial outreach stays on the curated strategic lane, without suppressing volume."""
    return (
        lower(lead.get("procurement_route")) == STRATEGIC_ROUTE
        and lower(lead.get("ai_outreach_status")) == STRATEGIC_INITIAL_STATUS
        and as_bool(lead.get("ai_outreach_enabled"))
        and not as_bool(lead.get("do_not_contact"))
        and not clean(lead.get("last_reply_at"))
        and not clean(lead.get("reply_category"))
    )

def strategic_priority_score(lead: dict[str, Any]) -> int:
    """Rank genuine purchasing authority above generic account score."""
    title = normalize_country(" ".join([
        clean(lead.get("contact_job_title")), clean(lead.get("contact_department")),
        clean(lead.get("decision_email_class")), clean(lead.get("contact_tier")),
    ]))
    score = min(100, int(buying_likelihood_score(lead)))
    if any(k in title for k in ("purchas", "procurement", "buyer", "sourcing", "import", "acheteur", "achats", "einkauf", "inkoop", "zakup", "kupiec")):
        score += 70
    elif any(k in title for k in ("category", "product manager", "product director", "supply chain")):
        score += 55
    elif any(k in title for k in ("owner", "founder", "managing director", "general manager", "chief executive", " ceo ", "director")):
        score += 40
    if lower(lead.get("decision_email_class")) == "direct_decision_maker":
        score += 35
    if lower(lead.get("contact_tier")) in {"a1", "a"}:
        score += 20
    if as_bool(lead.get("email_verified")):
        score += 15
    return score


def compact_strategic_draft(
    draft: EmailDraft,
    lead: dict[str, Any] | None = None,
    research: CompanyResearch | None = None,
    copy_policy: str = "",
) -> EmailDraft:
    """Compatibility normalizer that never substitutes a fixed sales template."""
    del lead, research
    subject = safe_prompt_text(draft.subject, 100)
    body = draft.body.strip()
    _min_words, max_words = policy_word_limits(copy_policy, default_min=35, default_max=140)
    if len(body.split()) > max_words:
        raise RuntimeError("Generated copy exceeds the active campaign_goal word limit")
    return draft.model_copy(update={"subject": subject, "body": body})


def _followup_subject(initial_subject: str) -> str:
    base = re.sub(r"^(?:re\s*:\s*)+", "", clean(initial_subject), flags=re.I).strip()
    return "Re: " + (base or "flooring sourcing")


def _followup_body(
    lead: dict[str, Any],
    sequence_number: int,
    campaign: dict[str, Any],
    initial_message: dict[str, Any],
    model: str,
) -> tuple[str, str]:
    copy_policy = campaign_copy_policy(campaign)
    client = build_gemini_client()
    fallback_model = clean(os.environ.get("GEMINI_FALLBACK_MODEL")) or DEFAULT_GEMINI_FALLBACK_MODEL
    prompt = f"""
Write follow-up number {sequence_number} for an existing B2B flooring outreach thread.
Return strict JSON matching EmailDraft.

AUTHORITATIVE CAMPAIGN COPY POLICY — LIVE FROM SUPABASE
--- BEGIN CAMPAIGN POLICY ---
{copy_policy}
--- END CAMPAIGN POLICY ---

RECIPIENT
{recipient_context(lead)}

INITIAL MESSAGE
Subject: {safe_prompt_text(initial_message.get('subject'), 160)}
Body: {safe_prompt_text(initial_message.get('body_text'), 1800)}

RULES
- Follow the campaign policy's FOLLOW-UP instructions for this sequence number.
- Add genuinely new value; do not restate the initial email and do not use a fixed follow-up template.
- Use only facts already present in the recipient data or initial message.
- Write in the recipient's business language.
- Do not add greeting, closing, signature, contact details, website or opt-out; Python adds them.
- signoff and opt_out must be empty strings.
- Return JSON only.
""".strip()
    response, model_used, _calls = gemini_generate_with_failover(
        client,
        primary_model=model,
        fallback_model=fallback_model,
        prompt=prompt,
        response_schema=EmailDraft,
        use_url_context=False,
    )
    if not response.text:
        raise RuntimeError("Gemini follow-up returned an empty response")
    draft = EmailDraft.model_validate_json(response.text)
    body = normalize_rendered_body_copy(draft.body, lead)
    return final_body(draft.model_copy(update={"body": body}), lead), model_used

def _latest_initial_message(db: Client, campaign_id: str, lead_id: str) -> dict[str, Any] | None:
    response = (db.table("email_messages").select("*")
        .eq("campaign_id", campaign_id).eq("lead_id", lead_id)
        .eq("direction", "outbound").eq("sequence_number", 0)
        .eq("status", "sent").order("sent_at", desc=True).limit(1).execute())
    rows = response.data or []
    return rows[0] if rows else None



IMAP_HOST = os.environ.get("OUTREACH_IMAP_HOST", "").strip()
IMAP_PORT = int(os.environ.get("OUTREACH_IMAP_PORT", "993"))

def _decode_imap_mailbox(raw: bytes | str) -> str:
    if isinstance(raw, bytes):
        return raw.decode("utf-8", errors="replace")
    return str(raw)

def _imap_mailbox_name(text: str) -> str:
    m = re.search(r'\)\s+"[^"]*"\s+(.*)$', text)
    if not m:
        return ""
    mailbox = m.group(1).strip()
    if len(mailbox) >= 2 and mailbox[0] == mailbox[-1] == '"':
        mailbox = mailbox[1:-1].replace('\\"', '"')
    return mailbox

def _find_sent_mailbox(imap: imaplib.IMAP4_SSL) -> str:
    override = clean(os.environ.get("OUTREACH_SENT_MAILBOX"))
    if override:
        return override
    typ, rows = imap.list()
    parsed: list[tuple[str, str]] = []
    if typ == "OK":
        for raw in rows or []:
            text = _decode_imap_mailbox(raw)
            mailbox = _imap_mailbox_name(text)
            if mailbox:
                parsed.append((text, mailbox))
        # SPECIAL-USE is the authoritative signal even when mail provider displays
        # a localized Chinese folder name in webmail.
        for text, mailbox in parsed:
            if "\\Sent" in text:
                return mailbox
        # Defensive fallbacks for accounts that do not advertise SPECIAL-USE.
        for _text, mailbox in parsed:
            folded = mailbox.casefold()
            if folded in {"sent", "sent messages", "sent items"} or folded.endswith("/sent"):
                return mailbox
    return "Sent"


def verify_sent_mailbox_access(sender_email: str, password: str) -> str:
    """Fail closed before live SMTP if the account Sent mailbox is not writable/readable."""
    with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ssl.create_default_context(), timeout=30) as imap:
        imap.login(sender_email, password)
        mailbox = _find_sent_mailbox(imap)
        typ, _ = imap.select(mailbox, readonly=True)
        if typ != "OK":
            raise RuntimeError(f"mail provider Sent-folder preflight failed: cannot open {mailbox}")
        return mailbox

def _sent_record_date(value: Any) -> str:
    raw = clean(value)
    if not raw:
        return formatdate(localtime=False)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return formatdate(parsed.timestamp(), localtime=False)
    except Exception:
        return formatdate(localtime=False)

def reconcile_unarchived_sent_messages(
    db: Client,
    sender_email: str,
    password: str,
    *,
    reply_to_email: str = "",
    display_name: str = "",
    limit: int = 20,
) -> int:
    """Repair mailbox history for SMTP-accepted rows without resending recipients."""
    response = (
        db.table("email_messages")
        .select("id,recipient_email,subject,body_text,provider_message_id,sent_at")
        .eq("sender_email", sender_email)
        .eq("status", "sent")
        .eq("provider", "smtp_unarchived")
        .order("sent_at", desc=False)
        .limit(limit)
        .execute()
    )
    repaired = 0
    for row in response.data or []:
        message_id = clean(row.get("provider_message_id"))
        recipient = lower(row.get("recipient_email"))
        subject = clean(row.get("subject"))
        body = str(row.get("body_text") or "")
        row_id = clean(row.get("id"))
        if not row_id or not message_id or not valid_email(recipient) or not subject:
            continue
        try:
            msg = EmailMessage()
            msg["From"] = formataddr((display_name, sender_email)) if display_name else sender_email
            msg["To"] = recipient
            msg["Reply-To"] = lower(reply_to_email) or sender_email
            msg["Subject"] = validate_header(subject, "subject")
            msg["Date"] = _sent_record_date(row.get("sent_at"))
            msg["Message-ID"] = validate_header(message_id, "provider_message_id")
            msg.set_content(body, subtype="plain", charset="utf-8")
            confirmed, info = archive_sent_copy(sender_email, password, msg)
            if confirmed:
                db.table("email_messages").update({
                    "provider": "smtp+imap_sent",
                    "error_message": None,
                }).eq("id", row_id).execute()
                repaired += 1
            else:
                db.table("email_messages").update({
                    "error_message": f"SMTP accepted; Sent-folder reconciliation still failed: {info}"[:2000]
                }).eq("id", row_id).execute()
        except Exception as exc:
            try:
                db.table("email_messages").update({
                    "error_message": f"Sent-folder reconciliation error: {str(exc)[:1600]}"[:2000]
                }).eq("id", row_id).execute()
            except Exception:
                pass
    return repaired

def archive_sent_copy(sender_email: str, password: str, message: EmailMessage) -> tuple[bool, str]:
    """Append the SMTP-sent message to configured mail provider's Sent folder and verify by Message-ID.

    SMTP acceptance alone does not guarantee that a programmatic message appears in
    mail provider webmail's Sent folder.  This function creates that server-side copy.
    """
    last_error = ""
    for attempt in range(1, 4):
        try:
            with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ssl.create_default_context(), timeout=30) as imap:
                imap.login(sender_email, password)
                mailbox = _find_sent_mailbox(imap)
                message_id = clean(message.get("Message-ID"))
                # Idempotency: a retry/reconciliation must never create duplicate
                # copies in the mailbox.
                typ, _ = imap.select(mailbox, readonly=True)
                if typ == "OK" and message_id:
                    typ, hits = imap.search(None, "HEADER", "Message-ID", f'"{message_id}"')
                    if typ == "OK" and hits and hits[0].split():
                        return True, f"{mailbox}:existing"
                raw = message.as_bytes()
                internal_dt = datetime.now(timezone.utc)
                try:
                    header_date = clean(message.get("Date"))
                    if header_date:
                        parsed_header_date = parsedate_to_datetime(header_date)
                        if parsed_header_date is not None:
                            internal_dt = parsed_header_date if parsed_header_date.tzinfo else parsed_header_date.replace(tzinfo=timezone.utc)
                except Exception:
                    pass
                typ, data = imap.append(mailbox, "\\Seen", imaplib.Time2Internaldate(internal_dt), raw)
                if typ != "OK":
                    raise RuntimeError(f"IMAP APPEND failed for {mailbox}: {data}")
                typ, _ = imap.select(mailbox, readonly=True)
                if typ != "OK":
                    raise RuntimeError(f"Could not open Sent mailbox {mailbox} after append")
                typ, hits = imap.search(None, "HEADER", "Message-ID", f'"{message_id}"')
                if typ != "OK" or not hits or not hits[0].split():
                    raise RuntimeError("Sent-folder append was not visible by Message-ID")
                return True, mailbox
        except Exception as exc:
            last_error = safe_prompt_text(exc, 800) if "safe_prompt_text" in globals() else str(exc)[:800]
            if attempt < 3:
                time.sleep(attempt)
    return False, last_error or "Unknown IMAP Sent-folder synchronization failure"

def send_threaded_email(sender_email: str, password: str, recipient_email: str, subject: str, body: str, in_reply_to: str = "") -> tuple[str, bool, str]:
    sender_email = validate_header(sender_email, "sender_email")
    recipient_email = validate_header(recipient_email, "recipient_email").lower()
    subject = validate_header(subject, "subject")
    message = EmailMessage()
    sender_person, direct_email, _ = direct_contact_details()
    message["From"] = formataddr((f"{sender_person} | {COMPANY_NAME}", sender_email))
    message["To"] = recipient_email
    # Replies must land in the mailbox this worker can synchronize.  A separate
    # reply-to is allowed only when OUTREACH_REPLY_TO_EMAIL is explicitly configured.
    reply_to = lower(os.environ.get("OUTREACH_REPLY_TO_EMAIL")) or sender_email
    message["Reply-To"] = reply_to
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=sender_email.rsplit("@", 1)[-1])
    if clean(in_reply_to):
        message["In-Reply-To"] = clean(in_reply_to)
        message["References"] = clean(in_reply_to)
    message.set_content(body, subtype="plain", charset="utf-8")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=30) as smtp:
        smtp.login(sender_email, password)
        refused = smtp.send_message(message, from_addr=sender_email, to_addrs=[recipient_email])
        if refused:
            raise RuntimeError(f"configured mail provider refused recipient: {refused}")
    archived, archive_info = archive_sent_copy(sender_email, password, message)
    return str(message["Message-ID"]), archived, archive_info


def strategic_reply_recorded(db: Client, lead: dict[str, Any]) -> bool:
    if clean(lead.get("last_reply_at")) or clean(lead.get("reply_category")):
        return True
    lead_id=clean(lead.get("lead_id"))
    if not lead_id: return False
    try:
        rows=(db.table("email_messages").select("id").eq("lead_id", lead_id).eq("direction", "inbound").limit(1).execute()).data or []
        return bool(rows)
    except Exception:
        return False


def process_one_due_followup(
    db: Client,
    campaign: dict[str, Any],
    sender_email: str,
    password: str,
    now_utc: datetime,
    followup_2_days: int,
    start_hour: int,
    end_hour: int,
    weekdays: set[int],
    preview_only: bool = False,
    model: str = DEFAULT_GEMINI_MODEL,
    send_windows: tuple[tuple[int, int], ...] = (),
) -> bool:
    """Send at most one qualified due follow-up using the live Supabase campaign policy."""
    campaign_id = clean(campaign.get("id"))
    response = (db.table("leads").select("*")
        .eq("procurement_route", STRATEGIC_ROUTE)
        .in_("ai_outreach_status", [FOLLOWUP_1_STATUS, FOLLOWUP_2_STATUS])
        .eq("do_not_contact", False)
        .lte("next_followup_at", now_utc.isoformat())
        .order("next_followup_at").limit(100).execute())
    for lead in response.data or []:
        if strategic_reply_recorded(db, lead):
            continue
        timezone_name = resolve_timezone(lead)
        if not timezone_name:
            continue
        local_dt = now_utc.astimezone(ZoneInfo(timezone_name))
        if not inside_send_window(local_dt, start_hour, end_hour, weekdays, send_windows):
            continue
        initial = _latest_initial_message(db, campaign_id, clean(lead.get("lead_id")))
        if not initial:
            continue
        seq = 1 if lower(lead.get("ai_outreach_status")) == FOLLOWUP_1_STATUS else 2
        # If SMTP succeeded on a prior run but the lead-state update failed, repair
        # the lead from delivery truth instead of sending the same follow-up again.
        existing_followup = (
            db.table("email_messages")
            .select("id,sent_at,provider")
            .eq("campaign_id", campaign_id)
            .eq("lead_id", clean(lead.get("lead_id")))
            .eq("direction", "outbound")
            .eq("message_type", "follow_up")
            .eq("sequence_number", seq)
            .eq("status", "sent")
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        if existing_followup:
            sent_time = parse_message_time(existing_followup[0].get("sent_at")) or now_utc
            if seq == 1:
                next_at = sent_time + timedelta(days=followup_2_days)
                db.table("leads").update({
                    "ai_outreach_status": FOLLOWUP_2_STATUS,
                    "next_followup_at": next_at.isoformat(),
                    "last_contacted_at": sent_time.isoformat(),
                    "outreach_attempt_count": 2,
                }).eq("lead_id", clean(lead.get("lead_id"))).execute()
            else:
                db.table("leads").update({
                    "ai_outreach_status": FOLLOWUP_DONE_STATUS,
                    "next_followup_at": None,
                    "last_contacted_at": sent_time.isoformat(),
                    "outreach_attempt_count": 3,
                }).eq("lead_id", clean(lead.get("lead_id"))).execute()
            print("RECONCILED_FOLLOWUP_WITHOUT_RESEND:", clean(lead.get("lead_id")), "sequence", seq)
            return True
        subject = _followup_subject(clean(initial.get("subject")))
        body, model_used = _followup_body(lead, seq, campaign, initial, model)
        if preview_only:
            print("FOLLOW-UP PREVIEW:", clean(lead.get("email")), subject)
            print(body)
            return True
        payload = {
            "campaign_id": campaign_id,
            "lead_id": clean(lead.get("lead_id")),
            "direction": "outbound",
            "sequence_number": seq,
            "message_type": "follow_up",
            "sender_email": sender_email,
            "recipient_email": lower(lead.get("email")),
            "subject": subject,
            "body_text": body,
            "status": "generated",
            "provider": None,
            "provider_message_id": None,
            "provider_thread_id": clean(initial.get("provider_thread_id")) or clean(initial.get("provider_message_id")),
            "ai_model": model_used,
            "generated_at": now_utc.isoformat(),
            "sent_at": None,
            "error_message": None,
        }
        created = db.table("email_messages").insert(payload).execute().data or []
        if not created:
            raise RuntimeError("Could not create follow-up email_message")
        message_row = created[0]
        try:
            provider_id, sent_copy_confirmed, sent_copy_info = send_threaded_email(sender_email, password, lower(lead.get("email")), subject, body, clean(initial.get("provider_message_id")))
            provider_name = "smtp+imap_sent" if sent_copy_confirmed else "smtp_unarchived"
            sync_error = None if sent_copy_confirmed else f"SMTP accepted; Sent-folder sync failed: {sent_copy_info}"
            db.table("email_messages").update({"status":"sent","sent_at":now_utc.isoformat(),"provider":provider_name,"provider_message_id":provider_id,"error_message":sync_error}).eq("id", clean(message_row.get("id"))).execute()
            try:
                if seq == 1:
                    next_at = now_utc + timedelta(days=followup_2_days)
                    db.table("leads").update({"ai_outreach_status":FOLLOWUP_2_STATUS,"next_followup_at":next_at.isoformat(),"last_contacted_at":now_utc.isoformat(),"outreach_attempt_count":2}).eq("lead_id", clean(lead.get("lead_id"))).execute()
                else:
                    db.table("leads").update({"ai_outreach_status":FOLLOWUP_DONE_STATUS,"next_followup_at":None,"last_contacted_at":now_utc.isoformat(),"outreach_attempt_count":3}).eq("lead_id", clean(lead.get("lead_id"))).execute()
            except Exception as lead_state_error:
                # Delivery truth is already recorded. Never retry the customer email
                # because a later CRM-state update failed; the next run reconciles it.
                print("WARNING: follow-up sent but lead-state update failed:", safe_prompt_text(lead_state_error, 500))
            print("SENT_FOLLOWUP:", lower(lead.get("email")), "sequence", seq)
            return True
        except Exception as exc:
            db.table("email_messages").update({"status":"failed","error_message":safe_prompt_text(exc,800)}).eq("id", clean(message_row.get("id"))).eq("status", "generated").execute()
            raise
    return False


def campaign_message(db: Client, campaign_id: str, lead_id: str) -> dict[str, Any] | None:
    response = (
        db.table("email_messages")
        .select("*")
        .eq("campaign_id", campaign_id)
        .eq("lead_id", lead_id)
        .eq("direction", "outbound")
        .eq("sequence_number", 0)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def mark_already_contacted(db: Client, lead_id: str) -> None:
    (
        db.table("leads")
        .update({
            "ai_outreach_enabled": False,
            "ai_outreach_status": "already_contacted",
        })
        .eq("lead_id", lead_id)
        .execute()
    )


def mark_permanent_domain_failure(
    db: Client,
    lead_id: str,
    recipient_email: str,
    reason: str,
) -> None:
    """Suppress a lead whose recipient domain permanently cannot receive email."""
    payload = {
        "ai_outreach_enabled": False,
        "ai_outreach_status": "invalid_email",
        "email_status": "hard_bounce_no_mx",
        "email_verified": False,
    }
    response = (
        db.table("leads")
        .update(payload)
        .eq("lead_id", lead_id)
        .eq("email", recipient_email)
        .execute()
    )
    if not response.data:
        print("WARNING: could not suppress permanent domain failure for", lead_id)
    print("Suppressed invalid recipient domain:", recipient_email, reason)


def safe_prompt_text(value: Any, max_length: int = 320) -> str:
    """
    Convert database content into a short, single-line factual value.

    Lead fields are untrusted data. Control characters and excessive length are
    removed before the values are placed inside the Gemini prompt.
    """
    text = clean(value)
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length]


def safe_email_body_text(value: Any, max_length: int = 4000) -> str:
    """Sanitize model-written email copy while preserving paragraph boundaries.

    Unlike safe_prompt_text(), this helper intentionally preserves newlines because
    paragraph structure is part of the live Supabase campaign policy. It removes
    non-printing control characters, normalizes CRLF/literal escaped newlines, trims
    line whitespace and caps repeated blank lines without rewriting customer copy.
    """
    text = clean(value)
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+", " ", text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_length].rstrip()


def recipient_mailbox_type(lead: dict[str, Any]) -> str:
    tier = mailbox_tier(lead)
    if tier == 99:
        return "unknown"
    return mailbox_tier_label(lead)


def contact_greeting_name(lead: dict[str, Any]) -> str:
    first_name = safe_prompt_text(
        lead.get("contact_first_name"),
        60,
    )
    if first_name:
        return first_name

    full_name = safe_prompt_text(
        lead.get("contact_full_name"),
        100,
    )
    if full_name:
        return full_name

    return ""


def infer_product_focus(lead: dict[str, Any]) -> str:
    evidence = " ".join(
        lower(lead.get(field))
        for field in (
            "pvc_fit_status",
            "gold_split_reason",
            "name",
        )
    )

    products: list[str] = []

    patterns = (
        ("SPC", (r"\bspc\b",)),
        ("LVT", (r"\blvt\b", r"\blvp\b")),
        ("PVC/vinyl", (r"\bpvc\b", r"\bvinyl\b", r"\bvinílic")),
        ("WPC", (r"\bwpc\b",)),
        ("laminate", (r"\blaminate\b", r"\blaminat")),
    )

    for label, expressions in patterns:
        if any(
            re.search(expression, evidence, re.IGNORECASE)
            for expression in expressions
        ):
            products.append(label)

    return ", ".join(products[:2]) if products else "flooring products"


def infer_business_type(lead: dict[str, Any]) -> str:
    evidence = " ".join(
        lower(lead.get(field))
        for field in (
            "gold_split_reason",
            "pvc_fit_status",
            "contact_department",
            "contact_job_title",
            "name",
        )
    )

    rules = (
        ("importer/distributor", ("importer", "import ", "distributor")),
        ("wholesaler/distributor", ("wholesale", "wholesaler")),
        (
            "retailer or flooring showroom",
            ("retailer", "retail", "showroom", "store"),
        ),
        (
            "project or contract flooring company",
            ("project", "contractor", "commercial flooring"),
        ),
        ("flooring brand", ("brand owner", "private label", "own brand")),
        (
            "flooring specialist",
            ("flooring", "floor ", "pisos", "sols", "boden"),
        ),
    )

    for label, terms in rules:
        if any(term in evidence for term in terms):
            return label

    return "flooring business"


def infer_outreach_angle(
    lead: dict[str, Any],
    business_type: str,
) -> str:
    readiness = lower(lead.get("container_readiness"))
    evidence = lower(lead.get("gold_split_reason"))

    if "import" in business_type or "wholesale" in business_type:
        return (
            "Focus on factory-direct supply, a relevant SPC/LVT programme, "
            "and OEM/private-label support only when it is useful."
        )

    if "retailer" in business_type or "showroom" in business_type:
        return (
            "Focus on a commercially relevant SPC/LVT range for their market. "
            "Do not assume they want private label or large container volumes."
        )

    if "project" in business_type or "contract" in business_type:
        return (
            "Focus on product specifications and reliable manufacturing support "
            "for flooring projects. Do not assume a live project exists."
        )

    if any(
        term in readiness
        for term in ("container_ready", "ready", "confirmed")
    ):
        return (
            "A factory-direct sourcing discussion is appropriate, but do not "
            "state that the recipient currently imports or buys containers."
        )

    if "brand" in business_type or "private label" in evidence:
        return (
            "OEM/private-label support may be mentioned once, without assuming "
            "that the recipient currently operates a private label."
        )

    return (
        "Focus on whether SPC or LVT is relevant to their current range or "
        "sourcing plan. Keep the question low-pressure."
    )


def language_instruction(lead: dict[str, Any]) -> str:
    """Choose language from coordinates first, then country, with no hardcoded map."""
    explicit = ""
    for field in (
        "preferred_language",
        "email_language",
        "business_language",
        "language",
    ):
        explicit = safe_prompt_text(lead.get(field), 80)
        if explicit:
            break

    if explicit:
        return (
            f"Use the explicit recipient language stored in the dataset: {explicit}. "
            "Write the subject, greeting, body, sign-off and opt-out entirely in "
            "that language. Do not switch languages."
        )

    normalized_location_country = normalize_country(lead.get("country"))
    deterministic_languages = {
        "france": "French",
        "martinique": "French",
        "reunion": "French",
        "guadeloupe": "French",
        "french guiana": "French",
        "monaco": "French",
        "spain": "Spanish",
        "portugal": "European Portuguese",
        "andorra": "Catalan",
        "germany": "German",
        "austria": "German",
        "italy": "Italian",
        "netherlands": "Dutch",
        "poland": "Polish",
        "czech republic": "Czech",
        "czechia": "Czech",
        "denmark": "Danish",
        "norway": "Norwegian",
        "sweden": "Swedish",
        "finland": "Finnish",
        "united kingdom": "English",
        "great britain": "English",
        "uk": "English",
        "ireland": "English",
        "brazil": "Brazilian Portuguese",
        "brasil": "Brazilian Portuguese",
        "australia": "English",
    }
    deterministic_language = deterministic_languages.get(normalized_location_country)
    if deterministic_language:
        return (
            f"Use {deterministic_language} for the entire customer-facing email. "
            f"The subject, greeting, body, sign-off and opt-out must all be in "
            f"{deterministic_language}. Do not switch to English."
        )

    country = safe_prompt_text(lead.get("country"), 100)
    region = (
        safe_prompt_text(lead.get("admin_level_1"), 100)
        or safe_prompt_text(lead.get("state"), 100)
    )
    secondary_region = safe_prompt_text(lead.get("admin_level_2"), 100)
    city = safe_prompt_text(lead.get("city"), 100)
    geocode_status = safe_prompt_text(lead.get("geocode_status"), 80)
    geocode_confidence = safe_prompt_text(lead.get("geocode_confidence"), 40)

    raw_latitude = lead.get("latitude")
    raw_longitude = lead.get("longitude")
    latitude: float | None = None
    longitude: float | None = None

    try:
        if raw_latitude not in (None, ""):
            latitude = float(raw_latitude)
    except (TypeError, ValueError):
        latitude = None

    try:
        if raw_longitude not in (None, ""):
            longitude = float(raw_longitude)
    except (TypeError, ValueError):
        longitude = None

    coordinates_available = (
        latitude is not None
        and longitude is not None
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and not (abs(latitude) < 0.000001 and abs(longitude) < 0.000001)
    )

    if coordinates_available:
        return f"""
Choose exactly one professional business language for this recipient.

PRIMARY GEOGRAPHIC EVIDENCE
Latitude: {latitude}
Longitude: {longitude}

SUPPORTING DATABASE EVIDENCE
Country: {country or 'unknown'}
Region: {region or 'unknown'}
Secondary region: {secondary_region or 'unknown'}
City: {city or 'unknown'}
Geocode status: {geocode_status or 'unknown'}
Geocode confidence: {geocode_confidence or 'unknown'}

Use latitude and longitude as the primary evidence to identify the country and
linguistic region. In multilingual countries, select the normal professional B2B
language of the specific region represented by the coordinates. Use country,
region and city only as supporting evidence. Select the language normally used
for a first professional business contact, not necessarily the most common
household language. Use general geographic and business knowledge. Do not infer
language from a person's name, company name or email address. Use one language
throughout the subject, greeting, body, sign-off and opt-out. Use English only
when the geographic evidence is genuinely inconclusive. Do not mention the
coordinates or the language-selection process in the email.
""".strip()

    if country:
        return f"""
Choose exactly one professional business language for this recipient.
Coordinates are unavailable, so use the country as the main signal.

Country: {country}
Region: {region or 'unknown'}
Secondary region: {secondary_region or 'unknown'}
City: {city or 'unknown'}

Use general knowledge of the country's professional B2B practices. When the
region or city helps resolve a multilingual country, use it. Select one language
and use it throughout the subject, greeting, body, sign-off and opt-out. Do not
infer language from a person's name, company name or email address. Use English
only when the country evidence is genuinely ambiguous. Do not mention the
language-selection process in the email.
""".strip()

    return (
        "Location and country information are unavailable. Write the complete "
        "email in professional international English and do not mix languages."
    )


def style_instruction(lead: dict[str, Any]) -> str:
    """Choose a stable writing rhythm so messages do not all share one template."""
    lead_id = clean(lead.get("lead_id"))
    variant = sum(ord(char) for char in lead_id) % 4

    variants = (
        f"Open with the verified company fit, then briefly introduce {COMPANY_NAME}, then ask the question.",
        f"Open with the relevant flooring category, connect it to the recipient's business, then introduce {COMPANY_NAME}.",
        "Open with a concise role-aware line when a contact role exists; otherwise use a company-focused opening.",
        "Open with a market or location-relevant observation only when it adds real meaning; otherwise lead with product fit.",
    )
    return variants[variant]


def message_shape_instruction(lead: dict[str, Any]) -> str:
    """Deterministically vary rhythm without adding another model call."""
    variant = fallback_variant(lead) % 5
    return (
        "Start with the verified product observation; use the second paragraph for the sourcing idea.",
        "Start with the buyer outcome, then support it with one verified website observation.",
        "Start with a concise category question converted into a declarative observation; then propose one concrete next step.",
        "Start with a gap or contrast in the visible range; avoid the phrase 'I saw that you already'.",
        "Start with the recipient channel or project use, then connect one product format to that context.",
    )[variant]


def preferred_sales_angle(lead: dict[str, Any]) -> str:
    tier = commercial_target_tier(lead)
    options = {
        1: ("private label", "repeat supply", "custom specification", "differentiated collection"),
        2: ("clear specification ladder", "coordinated range", "differentiated collection", "complementary format"),
        3: ("project specification", "custom specification", "repeat supply", "complementary format"),
        4: ("coordinated range", "complementary format", "clear specification ladder", "differentiated collection"),
        5: ("complementary format", "project specification", "coordinated range", "repeat supply"),
    }
    variants = options[tier]
    return variants[fallback_variant(lead) % len(variants)]


def question_punctuation_count(text: str) -> int:
    return sum(text.count(mark) for mark in ("?", "؟", "？"))


def normalize_website_url(lead: dict[str, Any]) -> str:
    raw = clean(lead.get("website"))
    if not raw:
        raw = clean(lead.get("company_domain"))
    if not raw:
        return ""
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = "https://" + raw.lstrip("/")
    return raw[:500]


def extract_research_sources(response: Any) -> list[str]:
    """Extract public URLs from Gemini grounding and URL-context metadata."""
    urls: list[str] = []

    def walk(value: Any, key_hint: str = "") -> None:
        if value is None:
            return
        if hasattr(value, "model_dump"):
            try:
                walk(value.model_dump(), key_hint)
                return
            except Exception:
                pass
        if isinstance(value, dict):
            for key, child in value.items():
                walk(child, str(key).lower())
            return
        if isinstance(value, (list, tuple, set)):
            for child in value:
                walk(child, key_hint)
            return
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            if any(token in key_hint for token in ("url", "uri", "source", "retrieved")):
                urls.append(value)

    candidates = getattr(response, "candidates", None) or []
    if candidates:
        candidate = candidates[0]
        walk(getattr(candidate, "grounding_metadata", None), "grounding_metadata")
        walk(getattr(candidate, "url_context_metadata", None), "url_context_metadata")

    deduped: list[str] = []
    for url in urls:
        if url not in deduped:
            deduped.append(url)
    return deduped[:8]


def dataset_research(
    lead: dict[str, Any],
    reason: str,
    *,
    generation_source: str = "dataset_no_website",
    gemini_attempts: int = 0,
) -> CompanyResearch:
    """Build a cautious normal-email brief from existing lead data only."""
    business_type = infer_business_type(lead)
    product_focus = infer_product_focus(lead)
    evidence_summary = (
        safe_prompt_text(lead.get("enrichment_fit_reason"), 260)
        or safe_prompt_text(lead.get("gold_split_reason"), 260)
        or safe_prompt_text(lead.get("pvc_fit_status"), 180)
    )

    facts: list[str] = []
    if product_focus and product_focus != "flooring products":
        facts.append(
            f"The available company data associates the business with {product_focus} flooring categories."
        )
    if business_type and business_type != "flooring business":
        facts.append(
            f"The available company data identifies the business as a {business_type}."
        )
    if evidence_summary:
        facts.append(f"Existing qualification notes indicate: {evidence_summary}")
    if not facts:
        facts.append(
            "The company is recorded as a flooring-related business, but no public website detail is available."
        )

    return CompanyResearch(
        company_fit=not negative_fit(lead),
        confidence="dataset",
        business_model=business_type,
        buyer_type=business_type,
        competitor_risk=("brand" in normalize_country(business_type)),
        verified_branch_or_location="",
        verified_facts=facts[:3],
        likely_needs=[
            "Hypothesis: a focused SPC or LVT catalogue may be relevant if the company is reviewing complementary flooring ranges."
        ],
        recommended_angle=infer_outreach_angle(lead, business_type),
        commercial_interpretation=(
            "A focused, coordinated flooring range may be more relevant than a broad supplier introduction."
        ),
        selected_sales_angle=preferred_sales_angle(lead),
        evidence_limits=(
            f"Dataset-only fallback: {reason}. No public website analysis or web search was used."
        ),
        source_urls=[],
        generation_source=generation_source,
        gemini_attempts=gemini_attempts,
    )


def research_company(
    lead: dict[str, Any],
    model: str,
    copy_policy: str = "",
    recent_copy: str = "",
) -> CompanyResearch:
    """Use one URL-Context Gemini call for both research and the draft."""
    company = safe_prompt_text(lead.get("name"), 180)
    country = safe_prompt_text(lead.get("country"), 100)
    city = safe_prompt_text(lead.get("city"), 100)
    website = normalize_website_url(lead)
    domain = safe_prompt_text(lead.get("company_domain"), 180)

    if not website:
        print("Website mode: no usable URL; using dataset-only normal email brief")
        return dataset_research(lead, "no usable company website URL")

    client = build_gemini_client()
    prompt = f"""
Read only the supplied public company website and return one structured JSON object.
Do not use Google Search, search-engine results, or unrelated external websites.

COMPANY TO IDENTIFY
Name: {company}
Country: {country or 'unknown'}
City: {city or 'unknown'}
Website: {website}
Company domain: {domain or 'not available'}

RECIPIENT BRIEF
--- BEGIN UNTRUSTED RECIPIENT DATA ---
{recipient_context(lead)}
--- END UNTRUSTED RECIPIENT DATA ---

VERIFIED SENDER FACTS
Company: {COMPANY_NAME}
Human contact: {require_env("SENDER_PERSON_NAME")}, {require_env("SENDER_JOB_TITLE")}
Direct reply email: {lower(require_env("SENDER_DIRECT_EMAIL"))}
Direct mobile: {require_env("SENDER_DIRECT_PHONE")}
Sender product/capability claims must come only from the live campaign policy below.
Do not use company age, establishment year, joint-venture history or production-location background unless the live campaign policy explicitly requires it.

AUTHORITATIVE CAMPAIGN COPY POLICY — LIVE FROM SUPABASE
--- BEGIN CAMPAIGN POLICY ---
{copy_policy}
--- END CAMPAIGN POLICY ---

RECENT SENT COPY — USE ONLY AS AN ANTI-REPETITION REFERENCE
--- BEGIN RECENT COPY ---
{recent_copy or 'No recent campaign copy is available.'}
--- END RECENT COPY ---

STRICT WEBSITE RESEARCH TASK
1. Confirm that the supplied website refers to this exact company.
2. Use only information visible through the supplied website URL and accessible pages.
3. Classify buyer_type as exactly one of: distributor, retailer, wholesaler/importer,
   project supplier, installer/contractor, manufacturer/brand, or irrelevant.
4. Set competitor_risk true for a flooring manufacturer, global flooring brand,
   or direct manufacturing competitor. Such companies are not outreach targets.
5. Return two to four concrete commercial facts that can create a real sales conversation.
   At least one fact must describe a named product or format, and another must describe
   the company's route to market, customer type, service model, project sector, showroom,
   branch network, online channel, private-label activity, or professional distribution role.
   Every verified_fact must be a complete grammatical sentence, not a heading, noun phrase,
   scraped snippet or fragment. Write verified_facts, likely_needs, recommended_angle, commercial_interpretation,
   selected_sales_angle and evidence_limits entirely in the professional language requested
   by the recipient brief. Do not return English research facts for a non-English recipient.
6. Company name, location, age, history, or merely selling flooring is not enough.
7. verified_branch_or_location may be populated only when the exact branch/location
   is stated on the supplied website page. Never copy a city only from recipient data.
8. From the verified facts, identify the most plausible buying need or commercial friction.
   Examples include an assortment gap, overlapping references, a missing installation
   format, unclear price steps, a need for repeatable specifications, a private-label
   opportunity, or a compact range for a particular customer channel. Put these only in
   likely_needs and phrase them explicitly as hypotheses, never as known facts.
9. recommended_angle must turn the strongest website observation into one practical sales
   pitch. It must explain: what the buyer may need, what Client Company could provide, and why
   that would matter commercially. Do not merely restate the website.
10. commercial_interpretation must connect one verified fact to one possible business
    implication. Keep it cautious, specific, and useful for selling.
11. selected_sales_angle must be exactly one concise angle from this list:
    coordinated range, private label, clear specification ladder, complementary format,
    project specification, repeat supply, custom specification, differentiated collection.
12. Set company_fit false when the website identity is uncertain, the company is
    irrelevant, a competitor manufacturer/brand, or no concrete commercial fact is visible.
    Careers, vacancies, legal, privacy, login and generic contact pages are not sufficient
    commercial evidence. At least one fact must be supported by a product, category,
    trade, wholesale, project, showroom or company-business page.
13. Never invent purchasing volumes, budgets, suppliers, imports, demand, stock levels,
    business problems, or live projects. A persuasive hypothesis is allowed only when it is
    visibly grounded in the website and worded as a possibility.

VERIFIED COMPANY CAPABILITY MENU
Select only one or two capabilities relevant to the buyer; never list everything:
- LVT/LVP 2.0-5.0 mm, including glue-down formats
- SPC 4.0-8.0 mm with click installation
- WPC 6.0-9.0 mm
- loose-lay, click and non-PVC flooring formats
- 5-7 day rapid sampling for custom development
- custom dimensions, wear layers, decors, molding and embossing
- batch traceability and repeatable production specifications
- OEM/ODM programs for brands, distributors, wholesalers and project channels

DRAFT FIELD — CREATE THE COMPLETE CUSTOMER COPY IN THIS SAME RESPONSE
1. The AUTHORITATIVE CAMPAIGN COPY POLICY above is the source of truth for subject,
   length, paragraph structure, CTA, tone, personalization, product positioning and
   anti-template behavior. Do not substitute a fixed template or a habitual CTA.
2. Write the complete customer-facing subject and body now. The Python renderer adds
   greeting, closing, signature, contact details and opt-out, so draft.body must not
   contain any of those protected elements.
3. Ground the copy in the verified website facts and the selected evidence-backed sales
   angle. research_fact_used must identify the fact actually used.
4. Treat RECENT SENT COPY only as negative examples for repetition. Do not reuse their
   subject skeleton, opening, factory sentence, CTA, or sentence sequence.
5. Use only verified sender capabilities and verified buyer facts. Never invent buyer
   volumes, suppliers, plans, projects, demand, stock, budgets or preferences.
6. Write naturally in the professional language requested by the recipient brief.
7. Do not include a greeting, closing, signature, email address, phone number, website or
   opt-out in draft.body. Python adds those deterministically after validation.
8. research_fact_used must be exactly F1, F2, F3 or F4.
9. signoff and opt_out must be empty strings.
10. Return only the structured JSON.
""".strip()

    try:
        fallback_model = os.environ.get(
            "GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK_MODEL
        ).strip()
        response, model_used, gemini_attempts = gemini_generate_with_failover(
            client,
            primary_model=model,
            fallback_model=fallback_model,
            prompt=prompt,
        )
        if not response.text:
            raise RuntimeError("Gemini website analysis returned an empty response")

        raw_research = json.loads(response.text)
        if not isinstance(raw_research, dict):
            raise RuntimeError("Gemini website analysis returned invalid JSON structure")

        # Sanitize the same response locally. Never spend a second Gemini request
        # merely because a model field is longer than requested.
        raw_research["confidence"] = safe_prompt_text(
            raw_research.get("confidence") or "low", 30
        )
        raw_research["business_model"] = safe_prompt_text(
            raw_research.get("business_model") or "flooring business", 320
        )
        raw_research["buyer_type"] = safe_prompt_text(
            raw_research.get("buyer_type") or "unknown", 80
        )
        raw_research["competitor_risk"] = as_bool(raw_research.get("competitor_risk"))
        raw_research["verified_branch_or_location"] = safe_prompt_text(
            raw_research.get("verified_branch_or_location") or "", 160
        )
        raw_research["recommended_angle"] = safe_prompt_text(
            raw_research.get("recommended_angle") or "", 500
        )
        raw_research["commercial_interpretation"] = safe_prompt_text(
            raw_research.get("commercial_interpretation") or "", 500
        )
        raw_research["selected_sales_angle"] = safe_prompt_text(
            raw_research.get("selected_sales_angle") or "", 160
        )
        raw_research["evidence_limits"] = safe_prompt_text(
            raw_research.get("evidence_limits") or "", 500
        )
        raw_research["verified_facts"] = [
            safe_prompt_text(item, 280)
            for item in (raw_research.get("verified_facts") or [])
            if safe_prompt_text(item, 280)
        ][:4]
        raw_research["likely_needs"] = [
            safe_prompt_text(item, 240)
            for item in (raw_research.get("likely_needs") or [])
            if safe_prompt_text(item, 240)
        ][:3]
        raw_research["source_urls"] = [
            safe_prompt_text(item, 500)
            for item in (raw_research.get("source_urls") or [])
            if safe_prompt_text(item, 500)
        ][:8]

        raw_draft = raw_research.get("draft")
        if isinstance(raw_draft, dict):
            draft_body = safe_email_body_text(raw_draft.get("body") or "", 4000)
            if len(draft_body) >= 40:
                raw_draft["language_name"] = safe_prompt_text(
                    raw_draft.get("language_name") or language_instruction(lead), 120
                )
                raw_draft["subject"] = safe_prompt_text(
                    raw_draft.get("subject") or f"{company} flooring range", 240
                )
                raw_draft["body"] = draft_body
                raw_draft["signoff"] = safe_prompt_text(raw_draft.get("signoff") or "", 500)
                raw_draft["opt_out"] = safe_prompt_text(raw_draft.get("opt_out") or "", 500)
                raw_draft["personalization_used"] = safe_prompt_text(
                    raw_draft.get("personalization_used") or "", 1200
                )
                raw_draft["research_fact_used"] = safe_prompt_text(
                    raw_draft.get("research_fact_used") or "F1", 500
                )
                raw_draft["generation_source"] = "gemini_website_personalized"
                raw_research["draft"] = raw_draft
            else:
                raw_research["draft"] = None
        else:
            raw_research["draft"] = None

        raw_research["generation_source"] = "gemini_website_personalized"
        raw_research["gemini_attempts"] = gemini_attempts
        raw_research["model_used"] = model_used
        research = CompanyResearch.model_validate(raw_research)
        extracted = extract_research_sources(response)
        research.source_urls = extracted or [website]
        research.verified_facts = [
            safe_prompt_text(item, 280)
            for item in research.verified_facts
            if safe_prompt_text(item, 280)
        ][:4]
        research.likely_needs = [
            safe_prompt_text(item, 240)
            for item in research.likely_needs
            if safe_prompt_text(item, 240)
        ][:3]
        research.evidence_limits = safe_prompt_text(
            research.evidence_limits or "Website-only URL Context analysis; no web search used.",
            500,
        )
        print("Website mode: one-call URL Context research and draft completed; Google Search disabled")
        return research
    except Exception as exc:
        if is_gemini_quota_error(exc):
            raise GeminiQuotaError(
                "Gemini API quota exhausted (429). The run stopped immediately; "
                "no fallback email was generated or sent."
            ) from exc
        attempts = locals().get("gemini_attempts", 0)
        if not attempts and is_gemini_transient_error(exc):
            attempts = 2
        print(
            "Website analysis unavailable after retry policy; using Python dataset fallback:",
            str(exc),
        )
        return dataset_research(
            lead,
            f"website analysis unavailable after retries: {str(exc)[:220]}",
            generation_source="python_fallback_after_gemini_error",
            gemini_attempts=attempts,
        )


RESEARCH_DETAIL_TERMS = {
    "acoustic", "architect", "bathroom", "click", "commercial", "contract",
    "decor", "design", "distribution", "hospitality", "hotel", "hybrid",
    "laminate", "luxury", "plank", "planks", "project", "renovation",
    "residential", "retail", "rigid", "showroom", "tile", "tiles", "trade",
    "underlay", "vinyl", "waterproof", "wholesale", "wood", "parquet",
    "spc", "lvt", "lvp", "wpc", "pvc",
}
RESEARCH_DETAIL_STEMS = {
    # Product/category vocabulary in the main campaign languages.
    "vinyl", "vinyle", "vinyls", "vinilic", "parquet", "laminat", "stratif",
    "revetement", "paviment", "boden", "vloer", "podlog", "wykladzin",
    "panel", "plank", "tile", "carrel", "decor", "click", "rigid", "spc", "lvt",
    "lvp", "wpc", "pvc", "non pvc", "loose lay",
    # Channel/business vocabulary.
    "import", "grossist", "wholesale", "distribut", "dystrybut", "dystrybuc", "hurtown",
    "retail", "showroom", "magasin", "tienda", "loja", "fachhandel", "contract",
    "project", "projet", "chantier", "obra", "projekt", "architect", "hospitality",
    "hotel", "commercial", "resident", "professionnel", "profesional", "gewerb",
}


def research_detail_present(text: str) -> bool:
    normalized = normalize_country(text)
    tokens = set(normalized.split())
    if tokens & RESEARCH_DETAIL_TERMS:
        return True
    compact = f" {normalized} "
    return any(stem in compact for stem in RESEARCH_DETAIL_STEMS)


def is_specific_research_fact(fact: str) -> bool:
    normalized = normalize_country(fact)
    if len(normalized) < 28:
        return False
    generic_phrases = (
        "is a flooring company", "is a flooring business", "has a long history",
        "is located in", "offers flooring products", "supplies flooring",
        "est une entreprise de revetements", "est situe", "propose des sols",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return research_detail_present(normalized)
    return research_detail_present(normalized)


LOW_VALUE_RESEARCH_PATH_TERMS = {
    "career", "careers", "job", "jobs", "vacancy", "vacancies", "recruit",
    "privacy", "legal", "terms", "conditions", "cookie", "cookies", "login",
    "signin", "account", "sitemap", "imprint", "mentions-legales",
}


def commercial_research_source(url: str) -> bool:
    raw = clean(url)
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    path_tokens = set(normalize_country(parsed.path).split())
    if path_tokens & LOW_VALUE_RESEARCH_PATH_TERMS:
        return False
    # A plain contact page is useful only as secondary evidence, not as the
    # sole basis for product/category claims.
    normalized_path = normalize_country(parsed.path).strip()
    if normalized_path in {"contact", "contact us", "contacts", "contactez nous", "kontakt"}:
        return False
    return bool(parsed.hostname)


CLOSED_BUSINESS_TERMS = (
    "permanently closed", "location has closed", "location is closed", "business closed",
    "ceased trading", "ceased operations", "no longer operating", "no longer trades",
    "fermé définitivement", "fermee definitivement", "fermée définitivement",
    "definitiv geschlossen", "dauerhaft geschlossen", "cerrado permanentemente",
    "cerrado definitivamente", "encerrado permanentemente", "definitief gesloten",
)

def research_indicates_closed_business(research: CompanyResearch) -> bool:
    evidence = normalize_country(" ".join([*research.verified_facts, research.business_model, research.commercial_interpretation]))
    return any(normalize_country(term) in evidence for term in CLOSED_BUSINESS_TERMS)


def research_is_usable(lead: dict[str, Any], research: CompanyResearch) -> tuple[bool, str]:
    if not research.company_fit:
        return False, "company data did not confirm a suitable flooring buyer"
    if research_indicates_closed_business(research):
        return False, "website evidence indicates this business/location is closed or no longer trading"

    buyer_type = normalize_country(research.buyer_type or research.business_model)
    if research.competitor_risk or buyer_type in {"manufacturer brand", "manufacturer", "brand"}:
        return False, "manufacturer/brand competitor is not a target buyer"

    # Website mode: one concrete product/channel fact is enough. Do not reject a
    # useful researched draft merely because an auxiliary metadata field is blank.
    if research.source_urls:
        # The model may localize free-text confidence labels (for example, a
        # French/German equivalent of "high"). Do not make send eligibility
        # depend on that presentation field. The fail-closed evidence gates
        # below are objective: a usable commercial source plus at least one
        # concrete product/channel fact is required before any draft can send.
        if not any(commercial_research_source(url) for url in research.source_urls):
            return False, "website evidence came only from careers, legal, login or contact pages"
        specific_facts = [fact for fact in research.verified_facts if is_specific_research_fact(fact)]
        if not specific_facts:
            return False, "website analysis found no concrete commercial fact"
        research.verified_facts = specific_facts[:4]
        if not clean(research.commercial_interpretation):
            research.commercial_interpretation = clean(research.recommended_angle) or (
                "A short, focused range may be easier for the buyer to assess."
            )
        if not clean(research.selected_sales_angle):
            research.selected_sales_angle = preferred_sales_angle(lead)
        return True, "specific website fact available"

    # No website: a normal, cautious database-based email is allowed.
    if not research.verified_facts:
        return False, "dataset fallback contained no usable business context"
    return True, "dataset-only normal email mode"


def research_context(research: CompanyResearch) -> str:
    facts = "\n".join(f"- F{index}: {fact}" for index, fact in enumerate(research.verified_facts, start=1)) or "- None verified"
    needs = "\n".join(f"- {need}" for need in research.likely_needs) or "- None; stay exploratory"
    sources = "\n".join(f"- {url}" for url in research.source_urls) or "- Metadata unavailable"
    return f"""
Company fit: {research.company_fit}
Research confidence: {research.confidence}
Business model: {research.business_model}
Buyer type: {research.buyer_type}
Competitor risk: {research.competitor_risk}
Verified branch/location: {research.verified_branch_or_location or 'None'}
Verified public facts:
{facts}
Possible needs (hypotheses only):
{needs}
Recommended collaboration angle: {research.recommended_angle or 'Use a modest exploratory angle'}
Commercial interpretation: {research.commercial_interpretation or 'Keep the interpretation cautious'}
Selected sales angle: {research.selected_sales_angle or 'coordinated range'}
Evidence limits: {research.evidence_limits or 'None stated'}
Research sources used internally:
{sources}
""".strip()


def recipient_context(lead: dict[str, Any]) -> str:
    """Build a concise factual brief for account-level personalization."""
    company_name = safe_prompt_text(lead.get("name"), 160)
    parent_company = safe_prompt_text(lead.get("parent_company"), 160)
    website = safe_prompt_text(lead.get("website"), 220)
    company_domain = safe_prompt_text(lead.get("company_domain"), 160)
    country = safe_prompt_text(lead.get("country"), 80)
    state = (
        safe_prompt_text(lead.get("state"), 80)
        or safe_prompt_text(lead.get("admin_level_1"), 80)
    )
    city = safe_prompt_text(lead.get("city"), 100)
    contact_name = contact_greeting_name(lead) if contact_name_safe_for_email(lead) else ""
    job_title = safe_prompt_text(lead.get("contact_job_title"), 120)
    department = safe_prompt_text(lead.get("contact_department"), 100)
    seniority = safe_prompt_text(lead.get("contact_seniority"), 80)
    business_type = infer_business_type(lead)
    product_focus = infer_product_focus(lead)
    outreach_angle = infer_outreach_angle(lead, business_type)

    # These are used as evidence, but the model is told not to expose internal labels.
    evidence_summary = (
        safe_prompt_text(lead.get("enrichment_fit_reason"), 300)
        or safe_prompt_text(lead.get("gold_split_reason"), 300)
    )

    location_parts = [part for part in (city, state, country) if part]
    location = ", ".join(dict.fromkeys(location_parts))

    facts = {
        "Company": company_name,
        "Parent company": parent_company,
        "Location": location,
        "Website": website,
        "Company domain": company_domain,
        "Contact name": contact_name,
        "Contact role": job_title,
        "Contact department": department,
        "Contact seniority": seniority,
        "Mailbox type": recipient_mailbox_type(lead),
        "Mailbox quality tier": mailbox_tier_label(lead),
        "Commercial business type": business_type,
        "Relevant flooring categories": product_focus,
        "Supporting business evidence": evidence_summary,
        "Recommended outreach angle": outreach_angle,
        "Language instruction": language_instruction(lead),
        "Natural structure instruction": style_instruction(lead),
        "Required message-shape variation": message_shape_instruction(lead),
        "Preferred sales angle when evidence supports it": preferred_sales_angle(lead),
    }

    return "\n".join(
        f"{label}: {value}"
        for label, value in facts.items()
        if value
    )


def language_key_for_lead(lead: dict[str, Any]) -> str:
    country = normalize_country(lead.get("country"))
    mapping = {
        "france": "french", "martinique": "french", "reunion": "french",
        "guadeloupe": "french", "french guiana": "french", "monaco": "french",
        "spain": "spanish", "portugal": "portuguese", "brazil": "portuguese",
        "brasil": "portuguese", "germany": "german", "austria": "german",
        "netherlands": "dutch", "belgium": "dutch", "poland": "polish",
        "italy": "italian",
    }
    return mapping.get(country, "english")


def localized_closing(lead: dict[str, Any]) -> str:
    return {
        "french": "Cordialement",
        "spanish": "Atentamente",
        "portuguese": "Atenciosamente",
        "german": "Mit freundlichen Grüßen",
        "dutch": "Met vriendelijke groet",
        "polish": "Z poważaniem",
        "italian": "Cordiali saluti",
        "english": "Best regards",
    }[language_key_for_lead(lead)]


def localized_opt_out(lead: dict[str, Any]) -> str:
    return {
        "french": "Vous pouvez répondre si vous ne souhaitez plus recevoir de message.",
        "spanish": "Puede responder si prefiere no recibir más mensajes.",
        "portuguese": "Pode responder se preferir não receber mais mensagens.",
        "german": "Sie können antworten, wenn Sie keine weiteren Nachrichten wünschen.",
        "dutch": "U kunt antwoorden als u geen verdere berichten wilt ontvangen.",
        "polish": "Możesz odpowiedzieć, jeśli nie chcesz otrzymywać kolejnych wiadomości.",
        "italian": "Può rispondere se preferisce non ricevere altri messaggi.",
        "english": "You may reply if you prefer not to receive further contact.",
    }[language_key_for_lead(lead)]


def localized_routing_line(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")

def generic_routing_outreach(lead: dict[str, Any]) -> bool:
    """True when the mailbox is a reception/general-company route rather than the buyer."""
    return mailbox_tier(lead) >= 3


def outreach_buyer_archetype(research: CompanyResearch) -> str:
    text = normalize_country(f"{research.buyer_type} {research.business_model}")
    if any(token in text for token in ("wholesaler", "wholesale", "importer", "import ")):
        return "wholesaler_importer"
    if any(token in text for token in ("distributor", "distribution", "chain")):
        return "distributor"
    if any(token in text for token in ("project supplier", "contract flooring", "project channel")):
        return "project_supplier"
    if any(token in text for token in ("retailer", "showroom", "online shop", "store")):
        return "retailer"
    if any(token in text for token in ("installer", "contractor", "floor layer", "fitter")):
        return "installer"
    return "general"


def localized_cta(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def localized_buyer_supply_reason(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def localized_factory_offer(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def localized_comparison_offer(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def localized_minimal_hook(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def localized_generic_routing_body(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")

def text_ends_as_complete_sentence(text: str) -> bool:
    value = clean(text)
    if not value or value[-1] not in ".?!。！？":
        return False
    normalized = normalize_country(value).rstrip(".?! ")
    dangling = (" and", " or", " with", " to", " for", " de", " et", " avec", " und", " mit", " voor", " en", " i", " oraz", " con", " e")
    return not any(normalized.endswith(token) for token in dangling)


def cooperation_offer_present(text: str) -> bool:
    """Compatibility helper: require a clear question/next step without prescribing wording."""
    return bool(clean(text)) and question_punctuation_count(text) == 1


def product_evidence_tokens(lead: dict[str, Any], research: CompanyResearch) -> set[str]:
    evidence = normalize_country(
        " ".join(
            [
                " ".join(research.verified_facts),
                infer_product_focus(lead),
                safe_prompt_text(lead.get("pvc_fit_status"), 300),
                safe_prompt_text(lead.get("gold_split_reason"), 300),
                safe_prompt_text(lead.get("enrichment_fit_reason"), 300),
            ]
        )
    )
    tokens: set[str] = set()
    patterns = {
        "spc": (r"\bspc\b", r"rigid core"),
        "lvt": (r"\blvt\b", r"\blvp\b", r"luxury vinyl"),
        "vinyl": (r"\bpvc\b", r"\bvinyl\b", r"vinilic", r"vinyle"),
        "wpc": (r"\bwpc\b",),
        "laminate": (r"laminat", r"stratif"),
        "parquet": (r"parquet", r"hardwood", r"wood flooring", r"bois"),
        "carpet": (r"carpet", r"moquette"),
    }
    for label, expressions in patterns.items():
        if any(re.search(expression, evidence, re.IGNORECASE) for expression in expressions):
            tokens.add(label)
    return tokens


def localized_product_focus(*args: Any, **kwargs: Any) -> tuple[str, str]:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


def sentence_start(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def fallback_variant(lead: dict[str, Any]) -> int:
    stable_key = clean(lead.get("lead_id")) or lower(lead.get("email")) or clean(lead.get("name"))
    return sum(ord(char) for char in stable_key) % 4


def fallback_personalized_draft(*args: Any, **kwargs: Any) -> EmailDraft:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")

LANGUAGE_MARKERS = {
    "english": {"the", "and", "with", "offers", "operates", "supplies", "provides", "customers", "range", "flooring", "showroom"},
    "french": {"le", "la", "les", "et", "avec", "propose", "exploite", "fournit", "clients", "gamme", "revêtements", "revetements"},
    "spanish": {"el", "la", "los", "las", "y", "con", "ofrece", "opera", "suministra", "clientes", "gama", "suelos"},
    "portuguese": {"o", "a", "os", "as", "e", "com", "oferece", "opera", "fornece", "clientes", "linha", "pisos"},
    "german": {"der", "die", "das", "und", "mit", "bietet", "betreibt", "liefert", "kunden", "sortiment", "boden"},
    "dutch": {"de", "het", "en", "met", "biedt", "heeft", "levert", "klanten", "assortiment", "vloeren"},
    "polish": {"i", "oraz", "z", "oferuje", "prowadzi", "dostarcza", "klientów", "klientow", "asortyment", "podłogi", "podlogi"},
    "italian": {"il", "la", "i", "le", "e", "con", "offre", "gestisce", "fornisce", "clienti", "gamma", "pavimenti"},
}


def language_marker_score(text: str, language: str) -> int:
    tokens = set(normalize_country(text).split())
    return len(tokens & LANGUAGE_MARKERS.get(language, set()))


def text_likely_matches_language(text: str, language: str) -> bool:
    language = normalize_country(language)
    if language == "english" or not clean(text):
        return True
    target_score = language_marker_score(text, language)
    english_score = language_marker_score(text, "english")
    return not (english_score >= 1 and target_score == 0)


def mixed_language_sentence_present(text: str, expected_language: str) -> bool:
    expected_language = normalize_country(expected_language)
    if expected_language in {"", "english"}:
        return False
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        if len(sentence.split()) < 5:
            continue
        if language_marker_score(sentence, "english") >= 1 and language_marker_score(sentence, expected_language) == 0:
            return True
    return False


def customer_safe_research_fact(research: CompanyResearch) -> str:
    """Return one verified fact cleaned for safe customer-facing fallback copy."""
    replacements = (
        (r"\bextensive selection\b", "selection"),
        (r"\bdiverse portfolio requires\b", "the visible range includes"),
        (r"\breliable manufacturing partner\b", "supplier"),
        (r"\bcahiers des charges exigeants\b", "cahiers des charges"),
        (r"\bintegrer des specifications\b", "comparer des spécifications"),
        (r"\bintégrer des spécifications\b", "comparer des spécifications"),
        (r"\bgarantissant une tracabilite\b", "avec une traçabilité claire"),
        (r"\bgarantissant une traçabilité\b", "avec une traçabilité claire"),
        (r"\bdisposer de gammes\b", "comparer des gammes"),
        (r"\bwe (?:visited|reviewed|researched|analysed|analyzed) your website\b", "the website states"),
        (r"\bi (?:visited|reviewed) your website\b", "the website states"),
    )
    for raw_fact in research.verified_facts:
        fact = safe_prompt_text(raw_fact, 360)
        fact = re.sub(r"^\s*F\s*\d+\s*:\s*", "", fact, flags=re.IGNORECASE)
        fact = re.sub(r"https?://\S+", "", fact, flags=re.IGNORECASE)
        for pattern, replacement in replacements:
            fact = re.sub(pattern, replacement, fact, flags=re.IGNORECASE)
        fact = re.sub(r"[!¡！?¿？]+", ".", fact)
        fact = " ".join(fact.split()).strip(" .;:")
        if len(fact) >= 15:
            return fact
    return ""


def research_aware_fallback_draft(*args: Any, **kwargs: Any) -> EmailDraft:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")

def best_local_fallback_draft(*args: Any, **kwargs: Any) -> EmailDraft:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")


SUBJECT_TRAILING_CONNECTORS = {
    # English
    "and", "or", "with", "for", "to", "from", "of",
    # French
    "et", "ou", "avec", "pour", "de", "du", "des", "à", "au", "aux",
    # German
    "und", "oder", "mit", "für", "von", "zu", "zur", "zum",
    # Spanish / Portuguese / Italian
    "y", "o", "con", "para", "de", "del", "da", "do", "dos", "e", "per", "di",
}


def normalize_subject_to_policy(value: Any, copy_policy: str = "") -> str:
    """Preserve Gemini wording while enforcing the live Supabase subject ceiling.

    The normalizer never invents customer-facing copy. When a model subject is too
    long, it keeps only the permitted prefix, then removes any trailing connector
    left dangling by that mechanical trim (for example ``and`` / ``et`` / ``und``),
    provided the result still satisfies the live minimum word count. Subjects that
    start below the minimum continue to fail closed in ``validate_draft``.
    """
    subject = safe_prompt_text(value, 100)
    if not subject:
        return ""
    subject_min, subject_max = policy_subject_word_limits(
        copy_policy, default_min=1, default_max=8
    )
    words = subject.split()
    if subject_max > 0 and len(words) > subject_max:
        words = words[:subject_max]
        while (
            len(words) > max(subject_min, 1)
            and words[-1].strip(" -—:;,.!?¿¡").casefold() in SUBJECT_TRAILING_CONNECTORS
        ):
            words.pop()
        subject = " ".join(words).rstrip(" -—:;,. ")
    return subject


def normalize_generated_draft(draft: EmailDraft, lead: dict[str, Any], research: CompanyResearch, copy_policy: str = "") -> EmailDraft:
    """Normalize model output without replacing any customer-facing sales copy."""
    expected = language_key_for_lead(lead)
    subject = normalize_subject_to_policy(draft.subject, copy_policy)
    if not subject:
        raise RuntimeError("Generated subject is empty")
    body = normalize_rendered_body_copy(draft.body, lead)
    required_paragraphs = policy_paragraph_count(copy_policy, default=2)
    body = normalize_body_to_policy(body, required_paragraphs)
    raw_fact = clean(draft.research_fact_used).upper()
    fact_match = re.search(r"\b(?:FACT\s*)?F?\s*([1-9]\d*)\b", raw_fact)
    fact_id = f"F{fact_match.group(1)}" if fact_match else "F1"
    return EmailDraft(
        language_name=expected.title(),
        subject=subject,
        body=body,
        signoff=localized_closing(lead),
        opt_out=localized_opt_out(lead),
        personalization_used=safe_prompt_text(
            draft.personalization_used
            or (research.verified_facts[0] if research.verified_facts else research.business_model),
            500,
        ),
        research_fact_used=fact_id,
        generation_source=safe_prompt_text(draft.generation_source or "gemini_campaign_policy", 80),
    )
def localized_research_subject(*args: Any, **kwargs: Any) -> str:
    raise RuntimeError("Legacy hardcoded sales-copy helper is disabled; use the active Supabase campaign_goal")
def dataset_draft_prompt(
    lead: dict[str, Any],
    research: CompanyResearch,
    copy_policy: str,
    recent_copy: str,
) -> str:
    return f"""
Write one complete first-touch B2B flooring email and return strict JSON matching EmailDraft.

AUTHORITATIVE CAMPAIGN COPY POLICY — LIVE FROM SUPABASE
--- BEGIN CAMPAIGN POLICY ---
{copy_policy}
--- END CAMPAIGN POLICY ---

RECIPIENT DATA — FACTUAL INPUT ONLY
--- BEGIN RECIPIENT DATA ---
{recipient_context(lead)}
--- END RECIPIENT DATA ---

RESEARCH / QUALIFICATION CONTEXT
--- BEGIN RESEARCH CONTEXT ---
{research_context(research)}
--- END RESEARCH CONTEXT ---

RECENT SENT COPY — NEGATIVE EXAMPLES FOR REPETITION ONLY
--- BEGIN RECENT COPY ---
{recent_copy or 'No recent campaign copy is available.'}
--- END RECENT COPY ---

RULES
- The Supabase campaign policy above is the source of truth for subject, length, paragraph structure, CTA, tone, product positioning and anti-template behavior.
- Write as an experienced export business developer: lead with one verified, recipient-specific hook, connect it naturally to a relevant {COMPANY_NAME} manufacturing or sourcing value, and finish with one low-pressure commercial question.
- Preserve the proven two-part sales rhythm when the campaign policy requires two paragraphs: paragraph 1 is the personalized hook plus relevant value; paragraph 2 is exactly one natural CTA question.
- Keep paragraph 1 to two or three short sentences. Do not write a research-summary block.
- Do not put the recipient's company name in the subject.
- Use only facts in the recipient and research context. Do not invent website facts, volumes, suppliers, projects, plans, demand, budgets or preferences.
- Write the complete customer-facing subject and body in the recipient's business language.
- Do not add a greeting, closing, signature, contact details, website or opt-out; Python adds those protected elements.
- Treat recent sent copy only as text to avoid. Do not reuse its subject skeleton, opening, factory sentence, CTA or sentence sequence.
- research_fact_used must identify a fact actually used, normally F1, F2 or F3.
- signoff and opt_out must be empty strings.
- Return JSON only.
""".strip()


def dataset_draft_repair_prompt(
    lead: dict[str, Any],
    research: CompanyResearch,
    copy_policy: str,
    recent_copy: str,
    rejected: EmailDraft,
    validation_error: str,
) -> str:
    """Request one policy-bound rewrite when the first model draft fails QA."""
    return dataset_draft_prompt(lead, research, copy_policy, recent_copy) + f"""

REPAIR ATTEMPT
The previous draft was rejected by deterministic validation.
Validation error: {safe_prompt_text(validation_error, 500)}
Rejected subject: {safe_prompt_text(rejected.subject, 180)}
Rejected body: {safe_prompt_text(rejected.body, 1800)}

Rewrite the subject and customer-facing body once. Correct the stated error,
keep exactly two readable sales paragraphs when required by policy, and do not
copy rejected wording merely to satisfy the schema. Return JSON only.
""".strip()


def generate_draft(
    lead: dict[str, Any],
    campaign: dict[str, Any],
    model: str,
    research: CompanyResearch,
    recent_copy: str = "",
) -> EmailDraft:
    """Generate customer copy from the live Supabase campaign_goal; never fall back to a sales template."""
    copy_policy = campaign_copy_policy(campaign)
    source_draft = research.draft
    model_used = research.model_used
    model_calls = research.gemini_attempts

    if source_draft is None:
        client = build_gemini_client()
        fallback_model = clean(os.environ.get("GEMINI_FALLBACK_MODEL")) or DEFAULT_GEMINI_FALLBACK_MODEL
        response, model_used, model_calls = gemini_generate_with_failover(
            client,
            primary_model=model,
            fallback_model=fallback_model,
            prompt=dataset_draft_prompt(lead, research, copy_policy, recent_copy),
            response_schema=EmailDraft,
            use_url_context=False,
        )
        if not response.text:
            raise RuntimeError("Gemini campaign-policy draft returned an empty response")
        source_draft = EmailDraft.model_validate_json(response.text)
        source_draft.generation_source = "gemini_dataset_campaign_policy"

    normalized = normalize_generated_draft(source_draft, lead, research, copy_policy)
    try:
        validate_draft(normalized, lead, research, copy_policy)
    except RuntimeError as initial_error:
        print("Initial export draft failed deterministic QA; requesting one repair:", initial_error)
        client = build_gemini_client()
        fallback_model = clean(os.environ.get("GEMINI_FALLBACK_MODEL")) or DEFAULT_GEMINI_FALLBACK_MODEL
        response, repair_model, repair_calls = gemini_generate_with_failover(
            client,
            primary_model=model,
            fallback_model=fallback_model,
            prompt=dataset_draft_repair_prompt(
                lead, research, copy_policy, recent_copy, normalized, str(initial_error)
            ),
            response_schema=EmailDraft,
            use_url_context=False,
        )
        if not response.text:
            raise RuntimeError("Gemini export-copy repair returned an empty response") from initial_error
        repaired_source = EmailDraft.model_validate_json(response.text)
        repaired_source.generation_source = "gemini_campaign_policy_repair"
        normalized = normalize_generated_draft(repaired_source, lead, research, copy_policy)
        validate_draft(normalized, lead, research, copy_policy)
        model_used = repair_model
        model_calls += repair_calls
        print("Export draft repair validation: passed")
    print("Supabase campaign-goal copy validation: passed")
    print("Draft source:", normalized.generation_source)
    print("Draft model used:", model_used or "research-call model")
    print("Gemini attempts for this candidate:", model_calls)
    return normalized



def expected_language_keyword(lead: dict[str, Any]) -> str:
    country = normalize_country(lead.get("country"))
    expected_by_country = {
        "france": "french",
        "martinique": "french",
        "reunion": "french",
        "guadeloupe": "french",
        "french guiana": "french",
        "monaco": "french",
        "spain": "spanish",
        "portugal": "portuguese",
        "andorra": "catalan",
        "germany": "german",
        "austria": "german",
        "italy": "italian",
        "netherlands": "dutch",
        "poland": "polish",
        "czech republic": "czech",
        "czechia": "czech",
        "denmark": "danish",
        "norway": "norwegian",
        "sweden": "swedish",
        "finland": "finnish",
        "united kingdom": "english",
        "great britain": "english",
        "uk": "english",
        "ireland": "english",
        "brazil": "portuguese",
        "brasil": "portuguese",
        "australia": "english",
    }
    return expected_by_country.get(country, "")


def identity_statement_present(text: str) -> bool:
    normalized = normalize_country(text)
    taiwan_terms = ("taiwan", "taiwanais", "taiwanesa", "taiwanes", "taiwanees", "taiwanisch", "tajwansk")
    japan_terms = ("japan", "japon", "japones", "japonais", "japanisch", "japans", "japonsk")
    china_terms = ("china", "chine", "cina", "chiny")
    return (
        any(term in normalized for term in taiwan_terms)
        and any(term in normalized for term in japan_terms)
        and any(term in normalized for term in china_terms)
    )


def catalogue_sample_reply_present(text: str) -> bool:
    """Compatibility name retained; now validates the cooperation/FOB/sample offer."""
    return cooperation_offer_present(text)

GENERIC_SUBJECT_PHRASES = {
    "solutions de sols", "solution de sols", "partenariat", "gamme de sols",
    "offre de sols", "solutions de revetements", "flooring solutions",
    "flooring partnership", "manufacturing partnership", "product range",
    "flooring range", "collaboration", "supply lines", "manufacturing capabilities",
    "soluciones de suelos", "gama de suelos",
    "oferta de suelos", "bodenlosungen", "sortiment boden", "vloeroplossingen",
}


def subject_is_too_generic(subject: str) -> bool:
    normalized = normalize_country(subject)
    return any(phrase in normalized for phrase in GENERIC_SUBJECT_PHRASES)


def unsafe_contact_name_appears(text: str, lead: dict[str, Any]) -> bool:
    if contact_name_safe_for_email(lead):
        return False
    normalized_text = normalize_country(text)
    candidates = {
        safe_prompt_text(lead.get("contact_first_name"), 60),
        safe_prompt_text(lead.get("contact_last_name"), 60),
        safe_prompt_text(lead.get("contact_full_name"), 100),
    }
    for value in candidates:
        normalized_name = normalize_country(value)
        if len(normalized_name) >= 3 and re.search(
            rf"\b{re.escape(normalized_name)}\b", normalized_text
        ):
            return True
    return False


def unsupported_location_appears(text: str, lead: dict[str, Any], research: CompanyResearch) -> bool:
    city = normalize_country(lead.get("city"))
    if len(city) < 3 or not re.search(rf"\b{re.escape(city)}\b", normalize_country(text)):
        return False
    verified = normalize_country(research.verified_branch_or_location)
    facts = normalize_country(" ".join(research.verified_facts))
    return city not in verified and city not in facts


def report_style_opening(text: str, lead: dict[str, Any]) -> bool:
    first_paragraph = re.split(r"\n\s*\n", text.strip(), maxsplit=1)[0]
    normalized = normalize_country(first_paragraph)
    company = normalize_country(lead.get("name"))
    report_phrases = (
        "distributes an extensive selection", "offers an extensive selection",
        "maintaining a diverse portfolio requires", "reliable manufacturing partners",
        "operates as a", "our manufacturing expertise supports",
        "comprehensive oem and odm cooperation", "across residential and commercial sectors",
        "propose des revetements de sol varies", "disposer de gammes",
        "peut faciliter la reponse", "cahiers des charges exigeants",
        "integrer des specifications", "garantissant une tracabilite",
        "fabricant en joint venture", "production en chine depuis",
        "ofrece una amplia gama", "mantener una cartera diversa",
        "oferece uma ampla gama", "manter um portfolio diversificado",
    )
    if any(phrase in normalized for phrase in report_phrases):
        return True
    if company and normalized.startswith(company):
        formal_verbs = (
            " distributes ", " offers ", " provides ", " specializes ", " operates ",
            " propose ", " distribue ", " commercialise ", " fournit ", " est ",
            " ofrece ", " distribuye ", " proporciona ", " es ",
            " oferece ", " distribui ", " fornece ", " e ",
        )
        padded = f" {normalized} "
        if any(verb in padded for verb in formal_verbs):
            return True
    return False


def human_sales_voice_present(text: str, lead: dict[str, Any]) -> bool:
    """Require direct buyer language and Supabase-configured readable paragraph limits."""
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text.strip()) if part.strip()]
    # A valid draft may arrive as one coherent paragraph or two short paragraphs.
    # The final renderer owns greeting, spacing, closing and signature formatting.
    if len(paragraphs) < 1:
        return False
    first = normalize_country(paragraphs[0])
    second_person = (
        " you ", " your ", " vous ", " votre ", " vos ", " su ", " sus ",
        " sie ", " ihr ", " ihre ", " u ", " uw ", " panstwa ", " państwa ",
        " vostra ", " vostro ", " tratate ", " arbeitet ", " trabalha ", " trabaja ",
    )
    padded = f" {first} "
    if not any(token in padded for token in second_person):
        return False
    opening_limit = as_int(require_env("OUTREACH_OPENING_PARAGRAPH_MAX_WORDS"), 0)
    second_limit = as_int(require_env("OUTREACH_SECOND_PARAGRAPH_MAX_WORDS"), 0)
    if opening_limit < 1 or second_limit < 1:
        raise RuntimeError("Supabase paragraph word limits were not initialized")
    if len(paragraphs[0].split()) > opening_limit:
        return False
    if len(paragraphs) > 1 and len(paragraphs[1].split()) > second_limit:
        return False
    return True


def validate_draft(
    draft: EmailDraft,
    lead: dict[str, Any],
    research: CompanyResearch,
    copy_policy: str = "",
) -> None:
    subject = draft.subject.strip()
    body = draft.body.strip()
    subject_min, subject_max = policy_subject_word_limits(copy_policy, default_min=1, default_max=8)
    body_min, body_max = policy_word_limits(copy_policy, default_min=35, default_max=140)

    if not (3 <= len(subject) <= 100):
        raise RuntimeError("Unsafe subject length")
    subject_words = len(subject.split())
    if not (subject_min <= subject_words <= subject_max):
        raise RuntimeError("Subject word count is outside the active campaign_goal")
    if not (120 <= len(body) <= 1800):
        raise RuntimeError("Unsafe email body length")
    if "\r" in subject or "\n" in subject:
        raise RuntimeError("Subject contains a newline")
    if subject_is_too_generic(subject):
        raise RuntimeError("Subject is too generic for company-specific outreach")
    if report_style_opening(body, lead):
        raise RuntimeError("Opening reads like an AI research summary instead of a sales hook")

    combined_customer_copy = f"{subject}\n{body}"
    if unsafe_contact_name_appears(combined_customer_copy, lead):
        raise RuntimeError("Draft used a person name for a generic or unmatched mailbox")
    if unsupported_location_appears(combined_customer_copy, lead, research):
        raise RuntimeError("Draft used an unverified branch or city")
    if generic_routing_outreach(lead):
        normalized_body = normalize_country(body)
        if not any(term in normalized_body for term in ("purchas", "einkauf", "inkoop", "achats", "compr")):
            raise RuntimeError("Generic-inbox email does not route clearly to purchasing")
    elif not human_sales_voice_present(body, lead):
        raise RuntimeError("Email lacks direct human sales voice or readable paragraph structure")

    word_count = len(body.split())
    if not (body_min <= word_count <= body_max):
        raise RuntimeError("Initial outreach word count is outside the active campaign_goal")
    sentence_count = len([x for x in re.split(r"(?<=[.!?])\s+", body.replace("\n", " ")) if x.strip()])
    if sentence_count < 2 or sentence_count > 8:
        raise RuntimeError("Initial outreach sentence count is outside the safety range")

    expected_language = expected_language_keyword(lead)
    if expected_language and expected_language not in normalize_country(draft.language_name):
        raise RuntimeError(f"Wrong generated language: expected {expected_language}, received {draft.language_name}")
    if expected_language and mixed_language_sentence_present(body, expected_language):
        raise RuntimeError("Customer-facing copy contains an English sentence inside a non-English email")

    valid_fact_ids = {f"F{index}" for index in range(1, len(research.verified_facts) + 1)}
    raw_fact_id = draft.research_fact_used.upper().strip()
    fact_match = re.search(r"\b(?:FACT\s*)?F?\s*([1-9]\d*)\b", raw_fact_id)
    normalized_fact_id = f"F{fact_match.group(1)}" if fact_match else ""
    if normalized_fact_id not in valid_fact_ids:
        normalized_copy = normalize_country(f"{subject} {body}")
        inferred_fact_id = ""
        for index, fact in enumerate(research.verified_facts, start=1):
            normalized_fact = normalize_country(fact)
            fact_terms = {
                token for token in re.findall(r"[a-z0-9]+", normalized_fact)
                if token in RESEARCH_DETAIL_TERMS or len(token) >= 5
            }
            if any(term in normalized_copy for term in fact_terms):
                inferred_fact_id = f"F{index}"
                break
        if inferred_fact_id not in valid_fact_ids:
            raise RuntimeError("Draft did not visibly use a verified research fact")

    combined = f"{subject}\n{body}\n{draft.opt_out}".lower()
    normalized_combined = normalize_country(combined)
    policy_banned = [phrase for phrase in policy_forbidden_phrases(copy_policy) if normalize_country(phrase) in normalized_combined]
    if policy_banned:
        raise RuntimeError("Copy contains a phrase forbidden by the active campaign_goal")
    prohibited = {
        "lowest price", "best price", "best quality", "cheapest", "market leader",
        "guaranteed", "special discount", "exclusive offer", "limited time",
        "act now", "urgent offer", "free quotation", "payment terms",
        "i hope this email finds you well", "i am reaching out", "we wanted to see if",
        "may leave room", "give your wholesale catalog an immediate edge",
        "steady stock availability", "support active commercial schedules smoothly",
        "secure your upcoming inventory needs",
        "give your wholesale catalogue an immediate edge", "upcoming distribution cycle",
        "reviewing a concise sample selection", "make it straightforward to compare",
        "fresh surface textures and formats", "i wanted to introduce", "long history",
        "extensive selection", "diverse portfolio requires", "reliable manufacturing partner",
        "comprehensive oem", "our manufacturing expertise supports", "explore potential opportunities",
        "synergy", "cahiers des charges exigeants", "integrer des specifications",
        "garantissant une tracabilite", "disposer de gammes", "depuis 1976", "founded in 1976",
        "established in 1976", "we visited your website", "i visited your website",
        "we reviewed your website", "we researched your company", "we analysed your company",
        "we analyzed your company", "we have worked with your company", "b2b score",
        "qualification reason", "container readiness", "pvc fit status", "lead generation",
        "free samples", "special offer",
    }
    detected = sorted(phrase for phrase in prohibited if normalize_country(phrase) in normalized_combined)
    if detected:
        raise RuntimeError("Prohibited or generic wording detected: " + ", ".join(detected))

    if COMPANY_WEBSITE.lower() in combined:
        raise RuntimeError("Gemini inserted the website into customer-facing copy")
    if question_punctuation_count(body) != 1:
        raise RuntimeError("Email body must contain exactly one question")
    if any(mark in body or mark in subject for mark in ("!", "¡", "！")):
        raise RuntimeError("Exclamation marks are not allowed")
    if any(token in combined for token in ("<html", "</html>", "utm_", "click here")):
        raise RuntimeError("HTML or tracking-style content is not allowed")

    body_paragraphs = [" ".join(p.split()) for p in re.split(r"\n\s*\n", body) if p.strip()]
    required_paragraphs = policy_paragraph_count(copy_policy, default=2)
    if len(body_paragraphs) != required_paragraphs:
        raise RuntimeError("Email paragraph count does not match the active campaign_goal")
    opening_sentences = [
        sentence for sentence in re.split(r"(?<=[.!?])\s+", body_paragraphs[0])
        if sentence.strip()
    ] if body_paragraphs else []
    if len(opening_sentences) > 3:
        raise RuntimeError("Opening paragraph must contain no more than three short sentences")
    if not all(text_ends_as_complete_sentence(p) for p in body_paragraphs):
        raise RuntimeError("Email contains an incomplete or truncated sentence")
    if len(draft.signoff) > 80 or len(draft.opt_out) > 300:
        raise RuntimeError("Localized closing text is too long")

def direct_contact_details() -> tuple[str, str, str]:
    """Return validated contact details initialized from Supabase runtime policy."""
    name = require_env("SENDER_PERSON_NAME")
    email = lower(require_env("SENDER_DIRECT_EMAIL"))
    phone = require_env("SENDER_DIRECT_PHONE")

    name = validate_header(name, "SENDER_PERSON_NAME")
    email = validate_header(email, "SENDER_DIRECT_EMAIL").lower()
    phone = validate_header(phone, "SENDER_DIRECT_PHONE")

    if not valid_email(email):
        raise RuntimeError("SENDER_DIRECT_EMAIL format is invalid")
    if not re.fullmatch(r"\+?[0-9 ()-]{7,30}", phone):
        raise RuntimeError("SENDER_DIRECT_PHONE format is invalid")
    return name, email, phone


def greeting_person_name(lead: dict[str, Any]) -> str:
    """Return a safe first name only when the selected mailbox supports that identity."""
    if not contact_name_safe_for_email(lead):
        return ""

    first_name = safe_prompt_text(lead.get("contact_first_name"), 60)
    last_name = safe_prompt_text(lead.get("contact_last_name"), 60)
    if first_name:
        if re.search(r"[?<>\[\]{}_|]", first_name):
            return ""
        raw_local = mailbox_raw_local_part(lead.get("email"))
        parts = [normalize_country(part) for part in re.split(r"[._-]+", raw_local) if part]
        f = normalize_country(first_name)
        l = normalize_country(last_name)
        if f and l and len(parts) >= 2 and f in parts and l in parts:
            # first.last is unambiguous enough to use the verified given name;
            # last.first is intentionally left generic rather than guessed.
            if parts[0] == f:
                return first_name
            if parts[0] == l:
                return ""
        return first_name

    full_name = safe_prompt_text(lead.get("contact_full_name"), 100)
    if not full_name:
        return ""
    first = full_name.split()[0]
    if re.search(r"[?<>\[\]{}_|]", first):
        return ""
    return first


def localized_greeting(lead: dict[str, Any]) -> str:
    """Return the protected, deterministic opening salutation."""
    language = language_key_for_lead(lead)
    person = greeting_person_name(lead)
    company = safe_prompt_text(lead.get("name"), 80)

    if language == "french":
        return f"Bonjour {person}," if person else "Bonjour,"
    if language == "spanish":
        return f"Hola {person}," if person else "Hola,"
    if language == "portuguese":
        return f"Olá {person}," if person else "Olá,"
    if language == "german":
        return f"Guten Tag {person}," if person else "Guten Tag,"
    if language == "dutch":
        return f"Beste {person}," if person else "Goedendag,"
    if language == "polish":
        return f"Dzień dobry {person}," if person else "Dzień dobry,"
    if language == "italian":
        return f"Buongiorno {person}," if person else "Buongiorno,"

    # English export emails always begin with "Hello". A company-team greeting is
    # used only when no safe personal name is available.
    if person:
        return f"Hello {person},"
    return f"Hello {company} team," if company else "Hello,"


def _looks_like_generated_greeting(line: str) -> bool:
    normalized = normalize_country(line).strip()
    greeting_prefixes = (
        "hello", "hi", "dear", "bonjour", "hola", "ola", "guten tag",
        "beste", "goedendag", "dzien dobry", "buongiorno",
    )
    return any(normalized == prefix or normalized.startswith(prefix + " ") for prefix in greeting_prefixes)


def normalize_rendered_body_copy(body: str, lead: dict[str, Any]) -> str:
    """Remove protected renderer fields without imposing a copy-policy template.

    Paragraph count is validated separately from the live Supabase campaign_goal.
    This renderer only preserves/normalizes the model's customer-facing copy.
    """
    text = safe_email_body_text(body, 6000)
    lines = text.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and _looks_like_generated_greeting(lines[0].strip()):
        lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)

    sender_person, direct_email, direct_phone = direct_contact_details()
    sender_title = require_env("SENDER_JOB_TITLE")
    protected_lines = {
        normalize_country(sender_person), normalize_country(sender_title), normalize_country(COMPANY_NAME),
        normalize_country(direct_email), normalize_country(direct_phone), normalize_country(require_env("SENDER_IDENTITY_LINE")),
        normalize_country(COMPANY_WEBSITE), normalize_country(COMPANY_WEBSITE.rstrip("/")),
        normalize_country(localized_closing(lead)), normalize_country(localized_opt_out(lead)),
    }
    clean_lines: list[str] = []
    for line in lines:
        if normalize_country(line.strip()) in protected_lines:
            continue
        clean_lines.append(line.rstrip())

    raw = "\n".join(clean_lines).strip()
    paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", raw) if " ".join(part.split())]
    return "\n\n".join(paragraphs)


def normalize_body_to_policy(body: str, required_paragraphs: int) -> str:
    """Repair harmless model whitespace to match the configured paragraph count.

    No sales wording is generated here. When a two-paragraph policy is active and
    Gemini returns the CTA as the final question sentence without a blank line, the
    function restores that missing boundary. Other structures are left for validation
    to reject rather than being retemplated.
    """
    text = safe_email_body_text(body, 6000)
    paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", text) if " ".join(part.split())]
    if len(paragraphs) == required_paragraphs:
        return "\n\n".join(paragraphs)

    if required_paragraphs == 2:
        # Prefer an explicit final line containing the single CTA question.
        lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
        if len(lines) >= 2 and question_punctuation_count(lines[-1]) == 1:
            first = " ".join(lines[:-1]).strip()
            second = lines[-1].strip()
            if first and second and question_punctuation_count(first) == 0:
                return first + "\n\n" + second

        # JSON/model serializers sometimes collapse all line breaks. Recover only the
        # final question sentence; do not invent or paraphrase any customer wording.
        one_line = " ".join(text.split())
        matches = list(re.finditer(r"(?<=[.!])\s+(?=[^.!?¿？]*[?¿？]\s*$)", one_line))
        if matches and question_punctuation_count(one_line) == 1:
            cut = matches[-1].end()
            first = one_line[:cut].strip()
            second = one_line[cut:].strip()
            if first and second and question_punctuation_count(first) == 0:
                return first + "\n\n" + second

    return "\n\n".join(paragraphs)

def validate_rendered_email(rendered: str, lead: dict[str, Any]) -> None:
    expected_greeting = localized_greeting(lead)
    if not rendered.startswith(expected_greeting + "\n\n"):
        raise RuntimeError("Rendered email is missing the protected greeting")
    if "\\n" in rendered:
        raise RuntimeError("Rendered email contains literal \n text")
    sender_person, direct_email, direct_phone = direct_contact_details()
    sender_title = require_env("SENDER_JOB_TITLE")
    required_once=(sender_person, f"{sender_title} | {COMPANY_NAME}", direct_email, direct_phone, COMPANY_WEBSITE.rstrip("/"))
    for value in required_once:
        if rendered.count(value) != 1:
            raise RuntimeError(f"Rendered email must contain exactly one protected signature value: {value}")
    closing=localized_closing(lead); opt_out=localized_opt_out(lead)
    if f"\n\n{closing}\n" not in rendered:
        raise RuntimeError("Rendered email is missing the protected closing")
    if not rendered.endswith(opt_out):
        raise RuntimeError("Rendered email is missing the protected opt-out")

def final_body(draft: EmailDraft, lead: dict[str, Any] | None = None) -> str:
    lead = lead or {}
    sender_person, direct_email, direct_phone = direct_contact_details()
    sender_title = require_env("SENDER_JOB_TITLE")
    body = normalize_rendered_body_copy(draft.body, lead)
    rendered = (
        localized_greeting(lead) + "\n\n" + body + "\n\n" + localized_closing(lead) + "\n" +
        sender_person + "\n" + f"{sender_title} | {COMPANY_NAME}" + "\n" + direct_email + "\n" + direct_phone + "\n" + COMPANY_WEBSITE.rstrip("/") + "\n\n" + localized_opt_out(lead)
    )
    validate_rendered_email(rendered, lead)
    return rendered

def write_preview_artifacts(rows: list[dict[str, Any]], output_dir: str = "preview_output") -> None:
    """Write downloadable previews without touching SMTP or Supabase messages."""
    if not rows:
        return
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    json_path = directory / "preview_summary.json"
    csv_path = directory / "preview_emails.csv"
    html_path = directory / "preview_emails.html"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    fieldnames = [
        "recipient", "company", "country", "commercial_target_tier", "contact_authority_tier",
        "mailbox_tier", "buyer_type", "research_scale_score", "sales_angle",
        "research_source", "draft_source", "model_used", "model_calls",
        "confidence", "verified_fact", "subject", "body",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})

    cards = []
    for index, row in enumerate(rows, start=1):
        cards.append(
            "<section>"
            f"<h2>{index}. {escape(str(row.get('company', '')))}</h2>"
            f"<p><b>Recipient:</b> {escape(str(row.get('recipient', '')))}<br>"
            f"<b>Country:</b> {escape(str(row.get('country', '')))}<br>"
            f"<b>Commercial tier:</b> {escape(str(row.get('commercial_target_tier', '')))}<br>"
            f"<b>Buyer type:</b> {escape(str(row.get('buyer_type', '')))}<br>"
            f"<b>Research scale:</b> {escape(str(row.get('research_scale_score', '')))}<br>"
            f"<b>Mailbox:</b> {escape(str(row.get('mailbox_tier', '')))}<br>"
            f"<b>Research:</b> {escape(str(row.get('research_source', '')))}<br>"
            f"<b>Draft source:</b> {escape(str(row.get('draft_source', '')))}<br>"
            f"<b>Model:</b> {escape(str(row.get('model_used', '')))}<br>"
            f"<b>Verified fact:</b> {escape(str(row.get('verified_fact', '')))}</p>"
            f"<h3>{escape(str(row.get('subject', '')))}</h3>"
            f"<pre>{escape(str(row.get('body', '')))}</pre>"
            "</section>"
        )
    html_path.write_text(
        "<!doctype html><meta charset='utf-8'><title>Platform email previews</title>"
        "<style>body{font-family:Arial,sans-serif;max-width:1000px;margin:30px auto;padding:0 20px;}"
        "section{border:1px solid #ccc;border-radius:10px;padding:20px;margin:20px 0;}"
        "pre{white-space:pre-wrap;font-family:Arial,sans-serif;line-height:1.5;background:#f7f7f7;padding:16px;}</style>"
        "<h1>Platform email previews</h1>" + "".join(cards),
        encoding="utf-8",
    )
    print("Preview artifacts written to:", directory.resolve())

def prepare_message(
    db: Client,
    campaign: dict[str, Any],
    lead: dict[str, Any],
    sender_email: str,
    draft: EmailDraft,
    body: str,
    model: str,
    existing: dict[str, Any] | None,
) -> str:
    payload = {
        "campaign_id": clean(campaign.get("id")),
        "lead_id": clean(lead.get("lead_id")),
        "direction": "outbound",
        "sequence_number": 0,
        "message_type": "initial",
        "sender_email": sender_email,
        "recipient_email": lower(lead.get("email")),
        "subject": draft.subject,
        "body_text": body,
        "status": "generated",
        "provider": None,
        "provider_message_id": None,
        "provider_thread_id": None,
        "ai_model": model,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": None,
        "error_message": None,
    }

    if existing:
        status = lower(existing.get("status"))
        if status == "sent":
            raise RuntimeError("The campaign email was already sent")
        if status == "generated":
            raise RuntimeError("A generated message is already processing")
        if status not in {"failed", "cancelled"}:
            raise RuntimeError(f"Unsupported existing status: {status}")
        message_id = clean(existing.get("id"))
        response = (
            db.table("email_messages")
            .update(payload)
            .eq("id", message_id)
            .in_("status", ["failed", "cancelled"])
            .execute()
        )
        if not response.data:
            raise RuntimeError("Could not prepare failed message for retry")
        return message_id

    response = db.table("email_messages").insert(payload).execute()
    rows = response.data or []
    if not rows or not clean(rows[0].get("id")):
        raise RuntimeError("Supabase did not create a valid message record")
    return clean(rows[0].get("id"))


def validate_header(value: str, field_name: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise RuntimeError(f"{field_name} cannot be empty")
    if "\r" in result or "\n" in result:
        raise RuntimeError(f"{field_name} contains a newline")
    return result


def send_email(sender_email: str, password: str, recipient_email: str, subject: str, body: str) -> tuple[str, bool, str]:
    sender_email = validate_header(sender_email, "sender_email")
    recipient_email = validate_header(recipient_email, "recipient_email").lower()
    subject = validate_header(subject, "subject")
    if not valid_email(recipient_email):
        raise RuntimeError("Recipient email format is invalid")
    if not password.strip():
        raise RuntimeError("configured mail provider security password is empty")

    message = EmailMessage()
    sender_person, direct_email, _ = direct_contact_details()
    display_name = f"{sender_person} | {COMPANY_NAME}"
    message["From"] = formataddr((display_name, sender_email))
    message["To"] = recipient_email
    # Replies go directly to Adam rather than the automated sending mailbox.
    # Replies must land in the mailbox this worker can synchronize.  A separate
    # reply-to is allowed only when OUTREACH_REPLY_TO_EMAIL is explicitly configured.
    reply_to = lower(os.environ.get("OUTREACH_REPLY_TO_EMAIL")) or sender_email
    message["Reply-To"] = reply_to
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=sender_email.rsplit("@", 1)[-1])
    message.set_content(body, subtype="plain", charset="utf-8")

    with smtplib.SMTP_SSL(
        SMTP_HOST,
        SMTP_PORT,
        context=ssl.create_default_context(),
        timeout=30,
    ) as smtp:
        smtp.login(sender_email, password)
        refused = smtp.send_message(
            message,
            from_addr=sender_email,
            to_addrs=[recipient_email],
        )
        if refused:
            raise RuntimeError(f"configured mail provider refused recipient: {refused}")
    archived, archive_info = archive_sent_copy(sender_email, password, message)
    return str(message["Message-ID"]), archived, archive_info

def mark_failed(db: Client, message_id: str, error: Exception) -> None:
    """Mark only an unsent/generated message failed.

    A mailbox-confirmed send is irreversible delivery truth and must never be
    downgraded because a later CRM/queue update failed.
    """
    if not message_id:
        return
    try:
        (
            db.table("email_messages")
            .update({"status": "failed", "error_message": str(error)[:2000]})
            .eq("id", message_id)
            .eq("status", "generated")
            .execute()
        )
    except Exception as logging_error:
        print("WARNING: failure logging failed:", logging_error)


def mark_success(
    db: Client,
    message_id: str,
    campaign: dict[str, Any],
    lead: dict[str, Any],
    provider_message_id: str,
    followup_1_days: int,
    sent_copy_confirmed: bool = False,
    sent_copy_info: str = "",
) -> None:
    sent_at = datetime.now(timezone.utc).isoformat()
    message_response = (
        db.table("email_messages")
        .update({
            "status": "sent",
            "provider": "smtp+imap_sent" if sent_copy_confirmed else "smtp_unarchived",
            "provider_message_id": provider_message_id,
            "sent_at": sent_at,
            "error_message": None if sent_copy_confirmed else f"SMTP accepted; Sent-folder sync failed: {sent_copy_info}"[:2000],
        })
        .eq("id", message_id)
        .eq("status", "generated")
        .execute()
    )
    if not message_response.data:
        raise RuntimeError("Email sent, but message log could not be updated")

    attempts = as_int(lead.get("outreach_attempt_count"), 0)
    lead_response = (
        db.table("leads")
        .update({
            "ai_outreach_enabled": False,
            "ai_outreach_status": FOLLOWUP_1_STATUS,
            "outreach_attempt_count": attempts + 1,
            "last_contacted_at": sent_at,
            "next_followup_at": (datetime.now(timezone.utc) + timedelta(days=followup_1_days)).isoformat(),
            "active_email_campaign_id": clean(campaign.get("id")),
        })
        .eq("lead_id", clean(lead.get("lead_id")))
        .eq("ai_outreach_status", "not_contacted")
        .eq("procurement_route", STRATEGIC_ROUTE)
        .execute()
    )
    if not lead_response.data:
        # Delivery is already confirmed by SMTP + mail provider Sent-folder IMAP.
        # A CRM-state mismatch must not turn a real send into a failed send or
        # leave a manual queue row eligible for duplicate delivery.
        print("WARNING: email delivery confirmed, but strict lead-state update did not apply")
        try:
            current_response = (
                db.table("leads")
                .select("lead_id,last_reply_at,do_not_contact,outreach_attempt_count")
                .eq("lead_id", clean(lead.get("lead_id")))
                .limit(1)
                .execute()
            )
            current = (current_response.data or [{}])[0]
            fallback_payload = {
                "ai_outreach_enabled": False,
                "outreach_attempt_count": max(
                    as_int(current.get("outreach_attempt_count"), 0), attempts + 1
                ),
                "last_contacted_at": sent_at,
                "active_email_campaign_id": clean(campaign.get("id")),
            }
            if not clean(current.get("last_reply_at")) and not as_bool(current.get("do_not_contact")):
                fallback_payload.update({
                    "ai_outreach_status": FOLLOWUP_1_STATUS,
                    "next_followup_at": (
                        datetime.now(timezone.utc) + timedelta(days=followup_1_days)
                    ).isoformat(),
                })
            fallback = (
                db.table("leads")
                .update(fallback_payload)
                .eq("lead_id", clean(lead.get("lead_id")))
                .execute()
            )
            if not fallback.data:
                print("WARNING: post-send fallback lead-state update also did not apply")
        except Exception as lead_state_error:
            print("WARNING: post-send lead-state repair failed:", clean(lead_state_error)[:300])


def main() -> None:
    print("=" * 72)
    print("STARTING CLIENT QUOTA-FILLING HUMAN-HOOK OUTREACH AGENT")
    print("VERSION:", AGENT_VERSION)
    print("COMPAT UPGRADE: 2026-08-14 STRATEGIC KEYMAN + DAY5/DAY11 FOLLOW-UP")
    print("=" * 72)

    sender_email = require_env("OUTREACH_MAIL_EMAIL").lower()
    password = require_env("OUTREACH_MAIL_PASSWORD")
    if not SMTP_HOST or not IMAP_HOST:
        raise RuntimeError(
            "OUTREACH_SMTP_HOST and OUTREACH_IMAP_HOST must be configured before a live run"
        )
    require_env("GEMINI_API_KEY")

    draft_model = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
    research_model = os.environ.get(
        "GEMINI_RESEARCH_MODEL", DEFAULT_GEMINI_RESEARCH_MODEL
    ).strip()
    fallback_model = os.environ.get(
        "GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK_MODEL
    ).strip()
    max_per_run = as_int(os.environ.get("MAX_EMAILS_PER_RUN"), 1)
    force_window = as_bool(os.environ.get("FORCE_LOCAL_WINDOW", "false"))
    preview_only = as_bool(os.environ.get("PREVIEW_ONLY", "false"))
    expand_to_all_not_contacted = False  # initialized from Supabase below
    delay_min = as_int(os.environ.get("DELAY_MIN_SECONDS"), 25)
    delay_max = as_int(os.environ.get("DELAY_MAX_SECONDS"), 45)

    if max_per_run < 1:
        raise RuntimeError("MAX_EMAILS_PER_RUN must be at least 1")
    if delay_min < 0 or delay_max < delay_min:
        raise RuntimeError("Invalid delay settings")

    now_utc = datetime.now(timezone.utc)
    db = supabase_client()
    runtime_control = fetch_campaign_runtime_control(db, "lead_outreach")
    campaign_name = runtime_control.campaign_name
    if not campaign_name:
        raise RuntimeError("Supabase campaign_controls.campaign_name is required for lead_outreach")
    campaign = fetch_campaign(db, campaign_name)
    configured_sender = lower(campaign.get("sender_email"))
    if configured_sender and configured_sender != sender_email:
        raise RuntimeError("Campaign sender_email does not match OUTREACH_MAIL_EMAIL")
    if runtime_control.sender_email and runtime_control.sender_email != sender_email:
        raise RuntimeError("Lead-outreach platform control sender does not match OUTREACH_MAIL_EMAIL")

    # Supabase is authoritative for changeable business policy. Environment
    # variables may only lower limits / provide compatibility when a setting is
    # missing; GitHub does not define market routing or campaign quotas.
    # Mutable business execution policy is required from Supabase. Missing policy
    # fails closed rather than silently reverting to code/workflow constants.
    campaign_tz = runtime_control.require_text("campaign_timezone")
    start_hour = runtime_control.require_int("local_send_start_hour", minimum=0, maximum=23)
    end_hour = runtime_control.require_int("local_send_end_hour", minimum=0, maximum=23)
    send_windows = runtime_control.require_send_windows("local_send_windows")
    weekdays = runtime_control.require_weekdays("local_send_weekdays")
    company_cooldown_days = runtime_control.require_int(
        "same_company_cooldown_days", minimum=1, maximum=365
    )
    cross_campaign_cooldown_days = runtime_control.require_int(
        "cross_campaign_cooldown_days", minimum=1, maximum=365
    )
    max_research_candidates = runtime_control.require_int(
        "max_research_candidates_per_run", minimum=1, maximum=500
    )
    manual_queue_fill_then_auto = runtime_control.require_bool("manual_queue_fill_then_auto")
    if not manual_queue_fill_then_auto:
        raise RuntimeError("lead_outreach manual_queue_fill_then_auto must remain enabled")
    manual_queue_scan_limit = runtime_control.require_int("manual_queue_scan_limit", minimum=1, maximum=5000)
    manual_processing_stale_hours = runtime_control.require_int("manual_processing_stale_hours", minimum=1, maximum=48)
    followup_1_days = runtime_control.require_int("followup_1_days", minimum=1, maximum=90)
    followup_2_days = runtime_control.require_int("followup_2_days", minimum=1, maximum=90)
    recent_subject_lookback_days = runtime_control.require_int("recent_subject_lookback_days", minimum=1, maximum=730)
    max_low_value_targets_per_run = runtime_control.require_int("max_low_value_targets_per_run", minimum=0, maximum=100)
    max_same_sales_angle_per_run = runtime_control.require_int("max_same_sales_angle_per_run", minimum=1, maximum=100)
    max_draft_similarity = runtime_control.require_float("max_draft_similarity", minimum=0.0, maximum=1.0)
    expand_to_all_not_contacted = runtime_control.require_bool("expand_to_all_not_contacted")
    opening_paragraph_max_words = runtime_control.require_int("opening_paragraph_max_words", minimum=1, maximum=500)
    second_paragraph_max_words = runtime_control.require_int("second_paragraph_max_words", minimum=1, maximum=500)
    sender_person_name = runtime_control.require_text("sender_person_name")
    sender_job_title = runtime_control.require_text("sender_job_title")
    sender_phone = runtime_control.require_text("sender_phone")
    reply_to_email = lower(runtime_control.require_text("reply_to_email"))
    sender_identity_line = runtime_control.require_text("sender_identity_line")
    if not valid_email(reply_to_email):
        raise RuntimeError("Supabase lead_outreach reply_to_email is invalid")
    # Existing helpers consume these values from process-local environment only;
    # Supabase remains the authoritative source and GitHub no longer defines them.
    os.environ["SENDER_PERSON_NAME"] = sender_person_name
    os.environ["SENDER_JOB_TITLE"] = sender_job_title
    os.environ["SENDER_DIRECT_PHONE"] = sender_phone
    os.environ["SENDER_DIRECT_EMAIL"] = reply_to_email
    os.environ["SENDER_IDENTITY_LINE"] = sender_identity_line
    os.environ["OUTREACH_OPENING_PARAGRAPH_MAX_WORDS"] = str(opening_paragraph_max_words)
    os.environ["OUTREACH_SECOND_PARAGRAPH_MAX_WORDS"] = str(second_paragraph_max_words)

    configured_daily_limit = as_int(campaign.get("daily_limit"), 0)
    if configured_daily_limit < 1:
        raise RuntimeError("Supabase campaign daily_limit must be at least 1")
    emergency_daily_cap_raw = clean(os.environ.get("DAILY_EMAIL_LIMIT"))
    daily_limit = configured_daily_limit
    if emergency_daily_cap_raw:
        emergency_daily_cap = as_int(emergency_daily_cap_raw, configured_daily_limit)
        if emergency_daily_cap < 1:
            raise RuntimeError("DAILY_EMAIL_LIMIT emergency cap must be at least 1")
        daily_limit = min(configured_daily_limit, emergency_daily_cap)
    max_per_run = min(max_per_run, daily_limit)

    if not preview_only:
        sent_mailbox = verify_sent_mailbox_access(sender_email, password)
        print("mail provider Sent-folder preflight OK:", sent_mailbox)
        sender_person, _, _ = direct_contact_details()
        repaired = reconcile_unarchived_sent_messages(
            db,
            sender_email,
            password,
            reply_to_email=reply_to_email,
            display_name=f"{sender_person} | {COMPANY_NAME}",
        )
        if repaired:
            print("Reconciled previously unarchived export Sent copies:", repaired)

    campaign_id = clean(campaign.get("id"))
    configured_batch_size = as_int(campaign.get("batch_size"), 1)
    campaign_local_now = campaign_local_datetime(now_utc, campaign_tz)
    campaign_date = campaign_local_now.date()
    live_blocked_reason = runtime_control.reason_if_blocked(campaign_date)
    blocked_reason = runtime_control.reason_if_blocked_for_run(campaign_date, preview_only=preview_only)
    if preview_only and live_blocked_reason:
        print("PREVIEW ONLY: bypassing live campaign control for QA:", live_blocked_reason)
    if blocked_reason:
        print("Client platform campaign control blocked this run:", blocked_reason)
        return

    if runtime_control.target_countries:
        print("Client platform target countries:", sorted(runtime_control.target_countries))
    else:
        print("Client platform target countries: ALL ELIGIBLE COUNTRIES")
    if runtime_control.priority_countries:
        print("Supabase country priority (highest first):", list(runtime_control.priority_countries))
    else:
        print("Supabase country priority: NONE; quality ranking only")

    sent_today = count_sent_today(db, campaign_id, now_utc, campaign_tz)
    remaining_today = daily_limit - sent_today

    print("UTC time:", now_utc.isoformat())
    print("Campaign local time:", campaign_local_now.isoformat())
    print("Campaign:", campaign_name)
    print("Campaign daily limit (Supabase source of truth):", configured_daily_limit)
    if daily_limit != configured_daily_limit:
        print("Emergency daily cap applied for this run:", daily_limit)
    print("Supabase campaign batch_size setting:", configured_batch_size)
    print("Already sent today:", sent_today)
    print("Commercial target prioritization: importer/distributor first")
    print("Contact authority prioritization: purchasing and executives first")
    print("Maximum retailer/installer targets per run:", max_low_value_targets_per_run)
    print("Maximum identical sales angles per run:", max_same_sales_angle_per_run)
    print("Batch copy similarity ceiling:", max_draft_similarity)
    print("Same-company contact cooldown days:", company_cooldown_days)
    print("Cross-campaign cooldown days:", cross_campaign_cooldown_days)
    print("Manual queue policy: due manual rows first, then automatic quota fill")
    print("Recent sent-subject duplicate lookback days:", recent_subject_lookback_days)
    print("Expand to all not-contacted database leads:", expand_to_all_not_contacted)
    print(
        "Recipient-local send windows:",
        ", ".join(f"{start:02d}:00–{end:02d}:00" for start, end in send_windows),
    )
    print("Allowed local weekdays:", sorted(weekdays))
    print("Force local window:", force_window)
    print("Preview only:", preview_only)
    print("Gemini research model:", research_model)
    print("Gemini draft model:", draft_model)
    print("Gemini fallback model:", fallback_model)
    copy_policy = campaign_copy_policy(campaign)
    historical_drafts = recent_sent_drafts(db, campaign_id, now_utc)
    print("Supabase campaign_goal copy policy: loaded")
    print("Recent sent copy examples loaded for anti-repetition:", len(historical_drafts))
    print("Maximum candidate attempts this run:", max_research_candidates)

    if remaining_today <= 0 and not preview_only:
        print("Daily campaign limit has already been reached. No emails will be sent.")
        return

    # Preview mode is read-only and may run after the daily sending quota is full.
    # Production mode remains capped by the remaining daily allowance.
    run_limit = max_per_run if preview_only else min(max_per_run, remaining_today)
    print("Maximum previews this run:" if preview_only else "Maximum emails this run:", run_limit)

    manual_requests_by_id: dict[str, dict[str, Any]] = {}
    manual_candidates: list[tuple[dict[str, Any], str, datetime]] = []
    if not preview_only and remaining_today > 0:
        claimed_requests = claim_manual_lead_outreach_requests(
            db,
            now_utc,
            start_hour,
            end_hour,
            weekdays,
            manual_queue_scan_limit,
            manual_processing_stale_hours,
            run_limit,
            run_force_local_window=force_window,
            send_windows=send_windows,
        )
        for request in claimed_requests:
            queue_id = clean(request.get("id"))
            lead_id = clean(request.get("lead_id"))
            manual_candidate, reason = build_manual_lead_candidate(
                db, request, now_utc, sender_email
            )
            if not manual_candidate:
                print("Manual Reach candidate unavailable:", lead_id, reason)
                if lower(reason).startswith("terminal:"):
                    finish_manual_lead_outreach_request(
                        db, request, "failed", error_message=reason
                    )
                else:
                    defer_manual_lead_outreach_request(
                        db, request, reason or "retry: manual candidate unavailable"
                    )
                continue
            recent_send = recent_send_for_lead(
                db, lead_id, now_utc, cross_campaign_cooldown_days
            )
            if recent_send:
                sent_at = clean(recent_send.get("sent_at"))
                reason = (
                    f"Cross-campaign cooldown: lead already contacted at {sent_at or 'a recent time'}; "
                    "manual queue entry cancelled to prevent duplicate outreach"
                )
                print(reason)
                finish_manual_lead_outreach_request(
                    db, request, "cancelled", error_message=reason
                )
                continue
            lead, timezone_name, local_dt = manual_candidate
            lead = dict(lead)
            lead["_manual_queue_id"] = queue_id
            manual_requests_by_id[queue_id] = request
            manual_candidates.append((lead, timezone_name, local_dt))

    automatic_candidates = local_time_candidates(
        db=db,
        sender_email=sender_email,
        now_utc=now_utc,
        start_hour=start_hour,
        end_hour=end_hour,
        weekdays=weekdays,
        force_window=force_window,
        expand_to_all_not_contacted=expand_to_all_not_contacted,
        preview_only=preview_only,
        target_countries=runtime_control.target_countries,
        send_windows=send_windows,
    )
    automatic_candidates = [
        item for item in automatic_candidates if strategic_route_eligible(item[0])
    ]
    if runtime_control.priority_countries:
        automatic_candidates.sort(
            key=lambda item: configured_priority_sort_key(
                item, runtime_control.priority_countries
            )
        )
    else:
        automatic_candidates.sort(
            key=lambda item: (
                -strategic_priority_score(item[0]),
                item[2],
                clean(item[0].get("lead_id")),
            )
        )

    manual_lead_ids = {clean(item[0].get("lead_id")) for item in manual_candidates}
    manual_emails = {lower(item[0].get("email")) for item in manual_candidates}
    automatic_candidates = [
        item
        for item in automatic_candidates
        if clean(item[0].get("lead_id")) not in manual_lead_ids
        and lower(item[0].get("email")) not in manual_emails
    ]
    candidates = manual_candidates + automatic_candidates
    print("Due manual leads claimed first:", len(manual_candidates))
    print(
        "Automatic quality queue prefix:",
        [clean(item[0].get("country")) for item in automatic_candidates[:run_limit]],
    )

    if not candidates:
        if not preview_only and process_one_due_followup(
            db,
            campaign,
            sender_email,
            password,
            now_utc,
            followup_2_days,
            start_hour,
            end_hour,
            weekdays,
            preview_only=False,
            model=draft_model,
            send_windows=send_windows,
        ):
            print("One due strategic follow-up filled an otherwise empty slot.")
            return
        print("No eligible leads remain under the permanent safety rules for this run.")
        return

    sent_count = 0
    preview_count = 0
    preview_rows: list[dict[str, Any]] = []
    used_subject_keys = recent_sent_subject_keys(db, campaign_id, now_utc, recent_subject_lookback_days)
    print("Recent unique sent subjects loaded:", len(used_subject_keys))
    failed_count = 0
    skipped_count = 0
    research_attempt_count = 0
    quota_stopped = False
    manual_permanent_reasons: dict[str, str] = {}
    manual_retry_reasons: dict[str, str] = {}
    finalized_manual_ids: set[str] = set()
    followup_checked = preview_only
    low_value_accepted_count = 0
    sales_angle_counts: dict[str, int] = {}
    accepted_drafts: list[EmailDraft] = []

    for lead, timezone_name, local_dt in candidates:
        if sent_count + preview_count >= run_limit:
            break

        lead_id = clean(lead.get("lead_id"))
        company = clean(lead.get("name"))
        recipient = lower(lead.get("email"))
        manual_queue_id = clean(lead.get("_manual_queue_id"))
        candidate_manual_request = manual_requests_by_id.get(manual_queue_id)
        is_manual_candidate = candidate_manual_request is not None

        # Manual rows always run first.  Once they are exhausted, one due
        # follow-up may consume a slot before new automatic first-touch leads.
        if not is_manual_candidate and not followup_checked and not preview_only:
            followup_checked = True
            if process_one_due_followup(
                db,
                campaign,
                sender_email,
                password,
                now_utc,
                followup_2_days,
                start_hour,
                end_hour,
                weekdays,
                preview_only=False,
                model=draft_model,
                send_windows=send_windows,
            ):
                sent_count += 1
                print("Due follow-up filled one slot after manual queue processing.")
                if sent_count >= run_limit:
                    break
                delay = random.randint(delay_min, delay_max)
                print(f"Waiting {delay} seconds before the next email")
                time.sleep(delay)

        print("-" * 72)
        print("Processing:", lead_id, company)
        print("Recipient:", recipient)
        print("Recipient source:", clean(lead.get("_recipient_source")) or "lead.email")
        if clean(lead.get("_company_email_fallback")):
            print("Company mailbox kept only as fallback:", clean(lead.get("_company_email_fallback")))
        print("Resolved timezone:", timezone_name)
        print("Recipient local time:", local_dt.isoformat())
        print("Country:", clean(lead.get("country")) or "unknown")
        if runtime_control.priority_countries:
            print("Configured country priority rank:", configured_country_priority_rank(lead, runtime_control.priority_countries))
        print("Mailbox class:", "named consumer mailbox" if is_consumer_email(recipient) else "company domain")
        print("Commercial target tier:", commercial_target_tier(lead))
        print("Contact authority tier:", contact_authority_tier(lead))
        print("Container/import evidence score:", container_import_evidence_score(lead))
        print("Company scale score:", company_scale_score(lead))
        print("Mailbox waterfall tier:", mailbox_tier_label(lead))
        print("Stored B2B score:", as_float(lead.get("b2b_score"), 0.0))
        print("Live buying-likelihood score:", buying_likelihood_score(lead))
        print("Live fair priority:", dynamic_fair_priority(lead))
        print("Company contact rank:", company_contact_rank(lead))
        print("Email status priority:", status_priority(lead))
        print("Email confidence priority:", email_confidence_priority(lead.get("email_confidence")))

        if not is_manual_candidate and already_contacted(db, recipient):
            print("Skipped: recipient email was already contacted")
            if not preview_only:
                mark_already_contacted(db, lead_id)
            skipped_count += 1
            continue

        if not is_manual_candidate and company_recently_contacted(
            db, lead, now_utc, company_cooldown_days
        ):
            print("Skipped: another address at the same company was contacted within the cooldown")
            skipped_count += 1
            continue

        try:
            mx_hosts = validate_recipient_domain(recipient)
            print("MX validation passed:", ", ".join(mx_hosts[:3]))
        except PermanentEmailDomainError as exc:
            print("Skipped permanently:", str(exc))
            if is_manual_candidate:
                manual_permanent_reasons[manual_queue_id] = f"terminal: {exc}"
            if not preview_only:
                mark_permanent_domain_failure(
                    db=db,
                    lead_id=lead_id,
                    recipient_email=recipient,
                    reason=str(exc),
                )
            skipped_count += 1
            continue
        except TransientEmailDomainError as exc:
            print("Skipped temporarily:", str(exc))
            if is_manual_candidate:
                manual_retry_reasons[manual_queue_id] = (
                    "retry: temporary MX lookup failure: " + safe_prompt_text(exc, 700)
                )
            skipped_count += 1
            continue

        existing = campaign_message(db, campaign_id, lead_id)
        if existing and lower(existing.get("status")) in {"sent", "generated"}:
            existing_status = lower(existing.get("status"))
            print("Skipped: campaign message already exists with status", existing_status)
            if candidate_manual_request and existing_status == "sent":
                finish_manual_lead_outreach_request(
                    db, candidate_manual_request, "sent", recipient_email=recipient
                )
                finalized_manual_ids.add(manual_queue_id)
                continue
            skipped_count += 1
            continue

        if research_attempt_count >= max_research_candidates:
            print(
                "Candidate cap reached; stopping this run before scanning "
                "more leads."
            )
            break

        message_id = ""
        try:
            research_attempt_count += 1
            print("Candidate attempt:", research_attempt_count, "of", max_research_candidates)
            recent_copy = recent_copy_prompt_context(historical_drafts + accepted_drafts)
            research = research_company(lead, research_model, copy_policy, recent_copy)
            research_ok, research_reason = research_is_usable(lead, research)
            print("Research confidence:", research.confidence)
            print("Research generation source:", research.generation_source)
            print("Research model calls:", research.gemini_attempts)
            print("Research model used:", research.model_used)
            print("Research business model:", research.business_model)
            print("Research buyer type:", research.buyer_type)
            print("Research scale score:", research_scale_score(research))
            print("Research verified facts:", " | ".join(research.verified_facts) or "none")
            print("Research sources:", " | ".join(research.source_urls) or "metadata unavailable")
            if not research_ok:
                if is_manual_candidate and not research_indicates_closed_business(research):
                    print("Manual Reach override: research eligibility gate bypassed:", research_reason)
                    research = dataset_research(
                        lead,
                        f"manual operator override after research gate: {research_reason}",
                        generation_source="manual_dataset_override",
                        gemini_attempts=research.gemini_attempts,
                    )
                    research_ok, research_reason = research_is_usable(lead, research)
                if not research_ok:
                    print("Skipped after research:", research_reason)
                    if is_manual_candidate and research_indicates_closed_business(research):
                        manual_permanent_reasons[manual_queue_id] = (
                            "terminal: " + research_reason
                        )
                    elif is_manual_candidate:
                        manual_retry_reasons[manual_queue_id] = (
                            "retry: research did not produce a usable account hook: "
                            + safe_prompt_text(research_reason, 700)
                        )
                    skipped_count += 1
                    continue

            final_target_tier = research_target_tier(lead, research)
            angle_key = sales_angle_key(research)
            print("Research-confirmed commercial target tier:", final_target_tier)
            print("Selected sales angle:", angle_key)
            if not is_manual_candidate and final_target_tier >= 4 and low_value_accepted_count >= max_low_value_targets_per_run:
                print("Skipped after research: retailer/installer run limit reached")
                skipped_count += 1
                continue
            if not is_manual_candidate and sales_angle_counts.get(angle_key, 0) >= max_same_sales_angle_per_run:
                print("Skipped after research: sales-angle repetition limit reached")
                skipped_count += 1
                continue

            draft = generate_draft(lead, campaign, draft_model, research, recent_copy)
            draft = compact_strategic_draft(draft, lead, research, copy_policy)
            draft = ensure_unique_subject(draft, lead, research, used_subject_keys)
            comparison_drafts = historical_drafts + accepted_drafts
            if comparison_drafts:
                highest_similarity = max(draft_similarity(draft, previous) for previous in comparison_drafts)
                print("Highest similarity to recent/history copy:", round(highest_similarity, 3))
                if highest_similarity > max_draft_similarity and not is_manual_candidate:
                    print("Skipped after drafting: copy is too similar to recent campaign mail")
                    skipped_count += 1
                    continue
                if highest_similarity > max_draft_similarity and is_manual_candidate:
                    print("Manual Reach override: copy-similarity gate is advisory for an explicitly selected lead")
            body = final_body(draft, lead)
            print("Generated language:", draft.language_name)
            print("Generated subject:", draft.subject)
            print("Personalization:", draft.personalization_used)

            if preview_only:
                accepted_drafts.append(draft)
                used_subject_keys.add(subject_key(draft.subject))
                sales_angle_counts[angle_key] = sales_angle_counts.get(angle_key, 0) + 1
                if final_target_tier >= 4:
                    low_value_accepted_count += 1
                print("PREVIEW SUBJECT:", draft.subject)
                print("PREVIEW BODY START")
                print(body)
                print("PREVIEW BODY END")
                preview_rows.append({
                    "recipient": recipient,
                    "company": company,
                    "country": clean(lead.get("country")),
                    "commercial_target_tier": final_target_tier,
                    "contact_authority_tier": contact_authority_tier(lead),
                    "mailbox_tier": mailbox_tier_label(lead),
                    "buyer_type": research.buyer_type,
                    "research_scale_score": research_scale_score(research),
                    "sales_angle": angle_key,
                    "research_source": research.generation_source,
                    "draft_source": draft.generation_source,
                    "model_used": research.model_used,
                    "model_calls": research.gemini_attempts,
                    "confidence": research.confidence,
                    "verified_fact": research.verified_facts[0] if research.verified_facts else "",
                    "subject": draft.subject,
                    "body": body,
                })
                preview_count += 1
                print("Preview generated; no database message created and no email sent.")
                continue

            message_id = prepare_message(
                db=db,
                campaign=campaign,
                lead=lead,
                sender_email=sender_email,
                draft=draft,
                body=body,
                model=draft_model,
                existing=existing,
            )

            provider_message_id, sent_copy_confirmed, sent_copy_info = send_email(
                sender_email=sender_email,
                password=password,
                recipient_email=recipient,
                subject=draft.subject,
                body=body,
            )

            mark_success(db, message_id, campaign, lead, provider_message_id, followup_1_days, sent_copy_confirmed, sent_copy_info)
            accepted_drafts.append(draft)
            used_subject_keys.add(subject_key(draft.subject))
            sales_angle_counts[angle_key] = sales_angle_counts.get(angle_key, 0) + 1
            if final_target_tier >= 4:
                low_value_accepted_count += 1
            sent_count += 1
            print("Email sent successfully:", recipient)
            if candidate_manual_request:
                finish_manual_lead_outreach_request(
                    db, candidate_manual_request, "sent", recipient_email=recipient
                )
                finalized_manual_ids.add(manual_queue_id)

            if sent_count < run_limit:
                delay = random.randint(delay_min, delay_max)
                print(f"Waiting {delay} seconds before the next email")
                time.sleep(delay)

        except GeminiQuotaError as exc:
            quota_stopped = True
            print("GEMINI QUOTA STOP:", str(exc))
            print("No more leads will be processed in this workflow run.")
            mark_failed(db, message_id, exc)
            if is_manual_candidate:
                manual_retry_reasons[manual_queue_id] = (
                    "retry: Gemini quota stopped the selected Manual Reach lead"
                )
            break
        except Exception as exc:
            failed_count += 1
            print("FAILED:", lead_id, str(exc))
            mark_failed(db, message_id, exc)
            if is_manual_candidate:
                manual_retry_reasons[manual_queue_id] = (
                    "retry: Manual Reach hit an execution/send exception: "
                    + safe_prompt_text(exc, 700)
                )

    if (
        not preview_only
        and not followup_checked
        and not quota_stopped
        and sent_count < run_limit
        and process_one_due_followup(
            db,
            campaign,
            sender_email,
            password,
            now_utc,
            followup_2_days,
            start_hour,
            end_hour,
            weekdays,
            preview_only=False,
            model=draft_model,
            send_windows=send_windows,
        )
    ):
        sent_count += 1
        print("Due follow-up filled one remaining slot after candidate processing.")

    if preview_rows:
        write_preview_artifacts(preview_rows)

    for queue_id, request in manual_requests_by_id.items():
        if queue_id in finalized_manual_ids:
            continue
        permanent_reason = manual_permanent_reasons.get(queue_id, "")
        if permanent_reason:
            finish_manual_lead_outreach_request(
                db, request, "failed", error_message=permanent_reason
            )
            continue
        retry_reason = manual_retry_reasons.get(queue_id) or (
            "retry: Gemini quota stopped the selected Manual Reach lead"
            if quota_stopped
            else "retry: selected Manual Reach lead did not produce a verified send; keep queued for the next eligible run"
        )
        defer_manual_lead_outreach_request(db, request, retry_reason)

    print("=" * 72)
    print("CLIENT EMAIL RUN COMPLETED")
    print("Sent:", sent_count)
    print("Previewed:", preview_count)
    print("Failed:", failed_count)
    print("Skipped:", skipped_count)
    print("Candidate attempts:", research_attempt_count)
    final_sent_today = sent_today + sent_count
    print("Stopped for Gemini quota:", quota_stopped)
    print("Campaign-day total after this run:", final_sent_today, "of", daily_limit)
    print("Daily target filled:", final_sent_today >= daily_limit)
    if final_sent_today < daily_limit:
        print("Quota shortfall:", daily_limit - final_sent_today, "email(s); permanent rules or external service limits prevented completion")
    print("=" * 72)
    if quota_stopped:
        raise GeminiQuotaError(
            "Workflow stopped safely because Gemini returned 429 RESOURCE_EXHAUSTED. "
            "Check AI Studio billing and rate limits before rerunning."
        )


if __name__ == "__main__":
    main()
