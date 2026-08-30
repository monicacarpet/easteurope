from __future__ import annotations

import base64
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import pycountry
import pydeck as pdk
import streamlit as st
import h3

from src.supabase_client.lead_repository import (
    fetch_available_leads,
    fetch_my_leads,
    fetch_all_leads,
    fetch_claim_summary,
    fetch_claim_log,
    claim_many_leads,
)


# ============================================================
# PAGE CONFIG
# ============================================================

st.set_page_config(
    page_title="B2B Flooring Lead Portal / B2B地面材料商机线索门户",
    layout="wide",
    initial_sidebar_state="collapsed",
)


# ============================================================
# PATHS / ASSETS
# ============================================================

APP_DIR = Path(__file__).resolve().parent
ASSETS_DIR = APP_DIR / "assets"

LOGO_CANDIDATES = [
    ASSETS_DIR / "logo.png",
    ASSETS_DIR / "logo.jpg",
    ASSETS_DIR / "logo.jpeg",
    ASSETS_DIR / "logo.webp",
    ASSETS_DIR / "Logo.png",
    ASSETS_DIR / "Logo.jpg",
    ASSETS_DIR / "Platform.png",
    ASSETS_DIR / "platform.png",
]

COVER_CANDIDATES = [
    ASSETS_DIR / "cover.png",
    ASSETS_DIR / "cover.gif",
    ASSETS_DIR / "cover.jpg",
    ASSETS_DIR / "cover.jpeg",
    ASSETS_DIR / "banner.png",
    ASSETS_DIR / "banner.gif",
]


# ============================================================
# STRICT ACCESS SETTINGS
# ============================================================

ADMIN_SUMMARY_EMAILS = {
    "gina@platform.com",
    "lucas@platform.com",
    "bi1@platform.com",
    "bi2@platform.com",
    "sales.manager@platform.com",
    "salesmanager@platform.com",
}

FULL_EXPORT_EMAILS = {
    "gina@platform.com",
    "lucas@platform.com",
    "bi1@platform.com",
}

CLAIM_ACCESS_ROLES = {
    "ceo",
    "business_gm",
    "bi_admin",
    "bi_partial",
    "sales_manager",
    "sales_rep",
}


# ============================================================
# LEAD TABLE COLUMNS
# ============================================================
# To show another Supabase column in the future, add its exact database
# column name to the appropriate list below. You can change the visible label
# in lead_column_config().

AVAILABLE_LEAD_COLUMNS = [
    "lead_id",
    "market",
    "name",
    "parent_company",
    "company_domain",
    "city",
    "state",
    "country",
    "street_address",
    "postal_code",
    "phone",
    "website",
    "email",
    "email_status",
    "email_confidence",
    "contact_full_name",
    "contact_job_title",
    "contact_department",
    "contact_linkedin_url",
    "account_tier",
    "contact_tier",
    "container_readiness",
    "pvc_fit_status",
    "pvc_evidence_url",
    "b2b_score",
    "gold_split_reason",
]


MY_LEAD_COLUMNS = [
    "market",
    "lead_id",
    "name",
    "parent_company",
    "company_domain",
    "city",
    "state",
    "country",
    "street_address",
    "postal_code",
    "phone",
    "website",
    "email",
    "email_source",
    "email_status",
    "email_confidence",
    "contact_first_name",
    "contact_last_name",
    "contact_full_name",
    "contact_job_title",
    "contact_seniority",
    "contact_department",
    "contact_linkedin_url",
    "company_linkedin_url",
    "mobile_phone",
    "direct_phone",
    "personal_email",
    "whatsapp_phone",
    "whatsapp_status",
    "email_verified",
    "email_verification_status",
    "contact_scope",
    "contact_is_shared",
    "account_tier",
    "contact_tier",
    "container_readiness",
    "pvc_fit_status",
    "pvc_evidence_url",
    "enrichment_source",
    "enriched_at",
    "assigned_at",
    "b2b_score",
    "gold_split_reason",
]


def lead_column_config(include_claim: bool = False) -> dict[str, Any]:
    """Return the labels and display types used by both lead tables."""

    config: dict[str, Any] = {
        "lead_id": st.column_config.TextColumn("Lead ID / 线索ID"),
        "market": st.column_config.TextColumn("Market / 市场"),
        "name": st.column_config.TextColumn("Company / 公司"),
        "parent_company": st.column_config.TextColumn("Parent Company / 母公司"),
        "company_domain": st.column_config.TextColumn("Company Domain / 公司域名"),
        "city": st.column_config.TextColumn("City / 城市"),
        "state": st.column_config.TextColumn("State / 州"),
        "country": st.column_config.TextColumn("Country / 国家"),
        "street_address": st.column_config.TextColumn("Address / 地址"),
        "postal_code": st.column_config.TextColumn("Postal Code / 邮编"),
        "phone": st.column_config.TextColumn("Phone / 电话"),
        "website": st.column_config.LinkColumn("Website / 网站"),
        "email": st.column_config.TextColumn("Email / 邮箱"),
        "email_source": st.column_config.TextColumn("Email Source / 邮箱来源"),
        "email_status": st.column_config.TextColumn("Email Status / 邮箱状态"),
        "email_confidence": st.column_config.TextColumn("Email Confidence / 邮箱置信度"),
        "company_linkedin_url": st.column_config.LinkColumn("Company LinkedIn / 公司领英"),
        "contact_first_name": st.column_config.TextColumn("First Name / 名"),
        "contact_last_name": st.column_config.TextColumn("Last Name / 姓"),
        "contact_full_name": st.column_config.TextColumn("Contact Person / 联系人"),
        "contact_job_title": st.column_config.TextColumn("Job Title / 职位"),
        "contact_seniority": st.column_config.TextColumn("Seniority / 职级"),
        "contact_department": st.column_config.TextColumn("Department / 部门"),
        "contact_linkedin_url": st.column_config.LinkColumn("Contact LinkedIn / 联系人领英"),
        "mobile_phone": st.column_config.TextColumn("Mobile / 手机"),
        "direct_phone": st.column_config.TextColumn("Direct Phone / 直线电话"),
        "personal_email": st.column_config.TextColumn("Personal Email / 个人邮箱"),
        "whatsapp_phone": st.column_config.TextColumn("WhatsApp / WhatsApp号码"),
        "whatsapp_status": st.column_config.TextColumn("WhatsApp Status / WhatsApp状态"),
        "email_verified": st.column_config.TextColumn("Email Verified / 邮箱已验证"),
        "email_verification_status": st.column_config.TextColumn("Verification Status / 验证状态"),
        "contact_scope": st.column_config.TextColumn("Contact Scope / 联系范围"),
        "contact_is_shared": st.column_config.TextColumn("Shared Contact / 共享联系人"),
        "account_tier": st.column_config.TextColumn("Account Tier / 客户等级"),
        "contact_tier": st.column_config.TextColumn("Contact Tier / 联系人等级"),
        "container_readiness": st.column_config.TextColumn("Container Readiness / 整柜准备度"),
        "pvc_fit_status": st.column_config.TextColumn("PVC/LVT Status / 产品匹配"),
        "pvc_evidence_url": st.column_config.LinkColumn("PVC Evidence / PVC证据"),
        "enrichment_source": st.column_config.TextColumn("Enrichment Source / 补充来源"),
        "enriched_at": st.column_config.TextColumn("Enriched At / 补充时间"),
        "assigned_at": st.column_config.TextColumn("Claimed At / 认领时间"),
        "b2b_score": st.column_config.NumberColumn("B2B Score / B2B评分"),
        "latitude": st.column_config.NumberColumn("Latitude / 纬度", format="%.6f"),
        "longitude": st.column_config.NumberColumn("Longitude / 经度", format="%.6f"),
        "country_iso2": st.column_config.TextColumn("ISO-2 / 国家代码2"),
        "country_iso3": st.column_config.TextColumn("ISO-3 / 国家代码3"),
        "geocode_status": st.column_config.TextColumn("Geocode Status / 定位状态"),
        "geocode_confidence": st.column_config.NumberColumn("Geocode Confidence / 定位置信度", format="%.2f"),
        "owner": st.column_config.TextColumn("Owner / 负责人"),
        "gold_split_reason": st.column_config.TextColumn("Reason / 入选原因"),
    }

    if include_claim:
        config["claim"] = st.column_config.CheckboxColumn("Claim / 认领")

    return config


# ============================================================
# CSS
# ============================================================

st.markdown(
    """
    <style>
        .main .block-container {
            padding-top: 0.5rem;
            padding-bottom: 2rem;
            max-width: 1500px;
        }

        .merged-cover {
            position: relative;
            width: 100vw;
            height: 350px;
            margin-left: calc(-50vw + 50%);
            margin-right: calc(-50vw + 50%);
            margin-top: 0;
            margin-bottom: 36px;
            overflow: hidden;
            background: #0f172a;
        }

        .merged-cover img.cover-bg {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center center;
            display: block;
            opacity: 0.72;
        }

        .merged-cover-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(
                90deg,
                rgba(15, 23, 42, 0.82) 0%,
                rgba(15, 23, 42, 0.48) 45%,
                rgba(15, 23, 42, 0.22) 100%
            );
        }

        .merged-cover-nav {
            position: absolute;
            top: 28px;
            left: max(56px, calc((100vw - 1280px) / 2 + 24px));
            right: max(56px, calc((100vw - 1280px) / 2 + 24px));
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 5;
        }

        .merged-brand {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .merged-logo-box {
            width: 110px;
            height: 110px;
            background: rgba(255, 255, 255, 0.96);
            border-radius: 22px;
            padding: 10px;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.30);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .merged-logo-box img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        .merged-logo-fallback {
            width: 110px;
            height: 110px;
            background: rgba(255, 255, 255, 0.96);
            border-radius: 22px;
            color: #166534;
            font-size: 36px;
            font-weight: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.30);
        }

        .merged-brand-title {
            color: #ffffff;
            font-size: 26px;
            font-weight: 850;
            letter-spacing: -0.4px;
        }

        .merged-brand-subtitle {
            color: #dbeafe;
            font-size: 14px;
            margin-top: 4px;
        }

        .merged-cover-date {
            color: #e2e8f0;
            font-size: 14px;
            line-height: 1.5;
            text-align: right;
        }

        .merged-cover-content {
            position: absolute;
            left: max(56px, calc((100vw - 1280px) / 2 + 24px));
            bottom: 52px;
            color: white;
            max-width: 760px;
            z-index: 5;
        }

        .merged-cover-title {
            font-size: 42px;
            line-height: 1.08;
            font-weight: 900;
            letter-spacing: -1px;
            margin-bottom: 14px;
        }

        .merged-cover-subtitle {
            font-size: 18px;
            line-height: 1.55;
            color: #e2e8f0;
            max-width: 720px;
        }

        .merged-cover-fallback {
            width: 100vw;
            height: 350px;
            margin-left: calc(-50vw + 50%);
            margin-right: calc(-50vw + 50%);
            margin-bottom: 36px;
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #0f172a 0%, #14532d 55%, #0f766e 100%);
        }

        .hero-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 22px;
            padding: 32px;
            box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
            min-height: 280px;
        }

        .badge {
            display: inline-block;
            padding: 7px 12px;
            border-radius: 999px;
            background: #dcfce7;
            color: #166534;
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 18px;
        }

        .hero-title {
            font-size: 34px;
            font-weight: 850;
            color: #0f172a;
            margin-bottom: 14px;
            line-height: 1.15;
        }

        .hero-subtitle {
            font-size: 17px;
            color: #334155;
            line-height: 1.7;
            margin-bottom: 18px;
        }

        .hero-note {
            font-size: 14px;
            color: #64748b;
            line-height: 1.6;
        }

        .login-box {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 22px;
            padding: 30px;
            box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
        }

        .login-title {
            font-size: 26px;
            font-weight: 850;
            color: #0f172a;
            margin-bottom: 8px;
        }

        .login-text {
            color: #64748b;
            font-size: 15px;
            margin-bottom: 18px;
            line-height: 1.6;
        }

        .footer {
            text-align: center;
            color: #94a3b8;
            font-size: 13px;
            margin-top: 36px;
            margin-bottom: 12px;
        }

        div[data-testid="stMetric"] {
            background: #ffffff;
            border: 1px solid #eeeeee;
            padding: 14px 16px;
            border-radius: 16px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.035);
        }
    </style>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_first_existing_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists() and path.is_file():
            return path
    return None


def get_image_mime(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".png":
        return "image/png"
    if suffix in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"

    return "image/png"


def file_to_base64(path: Path) -> str:
    with open(path, "rb") as file:
        return base64.b64encode(file.read()).decode("utf-8")


def safe_text(value: Any) -> str:
    if pd.isna(value) or value is None:
        return ""
    return str(value).strip()


def get_users() -> dict[str, dict[str, Any]]:
    if "users" not in st.secrets:
        return {}

    users = {}

    for username, user_data in st.secrets["users"].items():
        email = str(user_data.get("email", "")).strip().lower()
        password = str(user_data.get("password", "")).strip()
        name = str(user_data.get("name", username)).strip()
        role = str(user_data.get("role", "sales_rep")).strip().lower()

        if not email or not password:
            continue

        users[email] = {
            "username": str(username).strip().lower(),
            "email": email,
            "password": password,
            "name": name,
            "role": role,
        }

    return users


def authenticate(email: str, password: str) -> dict[str, Any] | None:
    users = get_users()

    email = str(email).lower().strip()
    password = str(password).strip()

    user = users.get(email)

    if user is None:
        return None

    if user["password"] != password:
        return None

    return {
        "username": user["username"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


def login_user(user: dict[str, Any]) -> None:
    st.session_state.logged_in = True
    st.session_state.user = user


def logout_user() -> None:
    st.session_state.logged_in = False
    st.session_state.user = None


def can_view_summary(user: dict[str, Any]) -> bool:
    email = str(user.get("email", "")).strip().lower()
    return email in ADMIN_SUMMARY_EMAILS


def can_download_all_data(user: dict[str, Any]) -> bool:
    email = str(user.get("email", "")).strip().lower()
    return email in FULL_EXPORT_EMAILS


def can_claim_leads(user: dict[str, Any]) -> bool:
    role = str(user.get("role", "sales_rep")).strip().lower()
    return role in CLAIM_ACCESS_ROLES


def role_label(role: str) -> str:
    labels = {
        "ceo": "CEO / 总裁",
        "business_gm": "Business GM / 业务总经理",
        "bi_admin": "BI Admin / BI管理员",
        "bi_partial": "BI Partial / BI部分权限",
        "sales_manager": "Sales Manager / 销售经理",
        "sales_rep": "Sales Representative / 销售代表",
    }

    return labels.get(role, role)


def ensure_market_column(df: pd.DataFrame, default_market: str = "Brazil") -> pd.DataFrame:
    if df.empty:
        return df

    df = df.copy()

    if "market" not in df.columns:
        df["market"] = default_market

    df["market"] = df["market"].fillna(default_market).astype(str)

    return df


def normalize_dataframe_for_display(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    df = df.copy()

    for col in df.columns:
        if df[col].dtype == "object":
            df[col] = df[col].fillna("")

    return df


def render_header() -> None:
    logo_path = get_first_existing_path(LOGO_CANDIDATES)
    cover_path = get_first_existing_path(COVER_CANDIDATES)

    if logo_path:
        logo_base64 = file_to_base64(logo_path)
        logo_html = f"""
        <div class="merged-logo-box">
            <img src="data:{get_image_mime(logo_path)};base64,{logo_base64}" />
        </div>
        """
    else:
        logo_html = '<div class="merged-logo-fallback">Platform</div>'

    if cover_path:
        cover_base64 = file_to_base64(cover_path)
        cover_html = f"""
        <img class="cover-bg" src="data:{get_image_mime(cover_path)};base64,{cover_base64}" />
        """
        cover_class = "merged-cover"
    else:
        cover_html = ""
        cover_class = "merged-cover-fallback"

    st.markdown(
        f"""
        <div class="{cover_class}">
            {cover_html}
            <div class="merged-cover-overlay"></div>

            <div class="merged-cover-nav">
                <div class="merged-brand">
                    {logo_html}
                    <div>
                        <div class="merged-brand-title">B2B Flooring Lead Portal</div>
                        <div class="merged-brand-subtitle">Internal Sales Intelligence System / 内部销售情报系统</div>
                    </div>
                </div>

                <div class="merged-cover-date">
                    Lead Distribution Portal / 线索分配门户<br>
                    {datetime.now().strftime("%B %d, %Y")}
                </div>
            </div>

            <div class="merged-cover-content">
                <div class="merged-cover-title">Controlled Lead Distribution / 可控线索分配</div>
                <div class="merged-cover-subtitle">
                    Claim qualified leads, track ownership, and manage Brazil sales opportunities.
                    <br>
                    认领高质量线索，追踪负责人，并管理巴西市场商机。
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ============================================================
# GIS HELPERS
# ============================================================

GIS_LATITUDE_CANDIDATES = ["latitude", "lat", "company_latitude"]
GIS_LONGITUDE_CANDIDATES = ["longitude", "lng", "lon", "company_longitude"]
GIS_OWNER_CANDIDATES = ["assigned_to", "assigned_email", "claimed_by_email", "owner_email"]
GIS_HIGH_QUALITY_SCORE = 75.0

COUNTRY_ALIASES = {
    "UK": "United Kingdom",
    "U.K.": "United Kingdom",
    "Great Britain": "United Kingdom",
    "England": "United Kingdom",
    "USA": "United States",
    "U.S.A.": "United States",
    "United States of America": "United States",
    "Russia": "Russian Federation",
    "South Korea": "Korea, Republic of",
    "Republic of Korea": "Korea, Republic of",
    "North Korea": "Korea, Democratic People's Republic of",
    "Vietnam": "Viet Nam",
    "Czech Republic": "Czechia",
    "Ivory Coast": "Côte d'Ivoire",
    "Moldova": "Moldova, Republic of",
    "Bolivia": "Bolivia, Plurinational State of",
    "Venezuela": "Venezuela, Bolivarian Republic of",
    "Tanzania": "Tanzania, United Republic of",
    "Iran": "Iran, Islamic Republic of",
    "Syria": "Syrian Arab Republic",
}


def first_existing_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    return next((column for column in candidates if column in df.columns), None)


def nonempty_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().ne("")


def safe_numeric(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(default)


def country_iso3(country_name: Any) -> str:
    value = safe_text(country_name)
    if not value:
        return ""

    value = COUNTRY_ALIASES.get(value, value)

    try:
        match = pycountry.countries.lookup(value)
        return str(match.alpha_3)
    except LookupError:
        return ""


def normalize_gis_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Prepare GIS columns without changing the original Supabase dataframe."""

    if df.empty:
        return df.copy()

    gis = df.copy()

    latitude_column = first_existing_column(gis, GIS_LATITUDE_CANDIDATES)
    longitude_column = first_existing_column(gis, GIS_LONGITUDE_CANDIDATES)
    owner_column = first_existing_column(gis, GIS_OWNER_CANDIDATES)

    if latitude_column is None:
        gis["latitude"] = pd.NA
    elif latitude_column != "latitude":
        gis["latitude"] = gis[latitude_column]

    if longitude_column is None:
        gis["longitude"] = pd.NA
    elif longitude_column != "longitude":
        gis["longitude"] = gis[longitude_column]

    gis["latitude"] = pd.to_numeric(gis["latitude"], errors="coerce")
    gis["longitude"] = pd.to_numeric(gis["longitude"], errors="coerce")

    valid_coordinates = (
        gis["latitude"].between(-90, 90, inclusive="both")
        & gis["longitude"].between(-180, 180, inclusive="both")
    )
    gis["is_geocoded"] = valid_coordinates

    for column in ["country", "state", "city", "market", "lead_status", "account_tier", "pvc_fit_status", "container_readiness"]:
        if column not in gis.columns:
            gis[column] = ""
        gis[column] = gis[column].fillna("").astype(str).str.strip()

    if "country_iso3" not in gis.columns:
        gis["country_iso3"] = ""
    gis["country_iso3"] = gis["country_iso3"].fillna("").astype(str).str.strip().str.upper()

    missing_iso = gis["country_iso3"].str.len().ne(3)
    if missing_iso.any():
        gis.loc[missing_iso, "country_iso3"] = gis.loc[missing_iso, "country"].map(country_iso3)

    if "b2b_score" not in gis.columns:
        gis["b2b_score"] = 0.0
    gis["b2b_score"] = safe_numeric(gis["b2b_score"])

    if "email" not in gis.columns:
        gis["email"] = ""
    if "contact_full_name" not in gis.columns:
        gis["contact_full_name"] = ""
    if "contact_job_title" not in gis.columns:
        gis["contact_job_title"] = ""
    if "phone" not in gis.columns:
        gis["phone"] = ""
    if "website" not in gis.columns:
        gis["website"] = ""

    gis["has_email"] = nonempty_text(gis["email"])
    gis["has_phone"] = nonempty_text(gis["phone"])
    gis["has_contact"] = nonempty_text(gis["contact_full_name"]) | nonempty_text(gis["contact_job_title"])
    gis["has_website"] = nonempty_text(gis["website"])

    tier_high = gis["account_tier"].str.upper().isin(["A", "A+", "GOLD", "PRIORITY A", "TIER A"])
    gis["is_high_quality"] = (gis["b2b_score"] >= GIS_HIGH_QUALITY_SCORE) | tier_high

    container_text = gis["container_readiness"].str.lower()
    gis["is_container_ready"] = container_text.str.contains(
        "ready|high|yes|confirmed|container", regex=True, na=False
    )

    fit_text = gis["pvc_fit_status"].str.lower()
    gis["is_pvc_fit"] = ~fit_text.str.contains(
        "not fit|irrelevant|reject|remove|wood only|service provider", regex=True, na=False
    )

    if owner_column is None:
        gis["owner"] = ""
    else:
        gis["owner"] = gis[owner_column].fillna("").astype(str).str.strip()

    gis["is_claimed"] = gis["lead_status"].str.lower().eq("claimed")
    gis["is_contactable"] = gis["has_email"] | gis["has_phone"] | gis["has_contact"]
    gis["is_unclaimed_priority"] = gis["is_high_quality"] & ~gis["is_claimed"]

    # Weighted score for geographic concentration. It keeps B2B score dominant
    # but rewards decision-maker, contactability, product fit and container readiness.
    gis["quality_weight"] = (
        gis["b2b_score"].clip(lower=0, upper=100)
        + gis["has_contact"].astype(int) * 10
        + gis["has_email"].astype(int) * 7
        + gis["is_container_ready"].astype(int) * 12
        + gis["is_pvc_fit"].astype(int) * 8
    ).clip(lower=1)

    return gis


def dataframe_options(df: pd.DataFrame, column: str) -> list[str]:
    if column not in df.columns:
        return []
    return sorted(
        df[column]
        .replace("", pd.NA)
        .dropna()
        .astype(str)
        .str.strip()
        .loc[lambda x: x.ne("")]
        .unique()
        .tolist()
    )


def apply_gis_filters(
    df: pd.DataFrame,
    country: str,
    state: str,
    city: str,
    statuses: list[str],
    account_tiers: list[str],
    pvc_statuses: list[str],
    minimum_score: float,
    only_high_quality: bool,
    only_unclaimed: bool,
    only_contactable: bool,
) -> pd.DataFrame:
    filtered = df.copy()

    if country != "All / 全部":
        filtered = filtered[filtered["country"] == country]
    if state != "All / 全部":
        filtered = filtered[filtered["state"] == state]
    if city != "All / 全部":
        filtered = filtered[filtered["city"] == city]
    if statuses:
        filtered = filtered[filtered["lead_status"].isin(statuses)]
    if account_tiers:
        filtered = filtered[filtered["account_tier"].isin(account_tiers)]
    if pvc_statuses:
        filtered = filtered[filtered["pvc_fit_status"].isin(pvc_statuses)]

    filtered = filtered[filtered["b2b_score"] >= float(minimum_score)]

    if only_high_quality:
        filtered = filtered[filtered["is_high_quality"]]
    if only_unclaimed:
        filtered = filtered[~filtered["is_claimed"]]
    if only_contactable:
        filtered = filtered[filtered["has_email"] | filtered["has_phone"] | filtered["has_contact"]]

    return filtered


def aggregate_countries(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    valid = df[nonempty_text(df["country"])].copy()
    if valid.empty:
        return pd.DataFrame()

    result = (
        valid.groupby(["country", "country_iso3"], dropna=False)
        .agg(
            total_leads=("lead_id", "count"),
            high_quality_leads=("is_high_quality", "sum"),
            contactable_leads=("is_contactable", "sum"),
            decision_maker_leads=("has_contact", "sum"),
            container_ready_leads=("is_container_ready", "sum"),
            claimed_leads=("is_claimed", "sum"),
            unclaimed_priority=("is_unclaimed_priority", "sum"),
            geocoded_leads=("is_geocoded", "sum"),
            average_b2b_score=("b2b_score", "mean"),
            quality_value=("quality_weight", "sum"),
        )
        .reset_index()
    )

    result["contact_coverage_pct"] = (
        result["contactable_leads"] / result["total_leads"] * 100
    ).round(1)
    result["geocode_coverage_pct"] = (
        result["geocoded_leads"] / result["total_leads"] * 100
    ).round(1)
    result["average_b2b_score"] = result["average_b2b_score"].round(1)

    return result


def aggregate_cities(df: pd.DataFrame) -> pd.DataFrame:
    geocoded = df[df["is_geocoded"]].copy()
    if geocoded.empty:
        return pd.DataFrame()

    geocoded["city_label"] = geocoded["city"].where(nonempty_text(geocoded["city"]), "Unknown city")
    geocoded["state_label"] = geocoded["state"].where(nonempty_text(geocoded["state"]), "Unknown state")

    result = (
        geocoded.groupby(["country", "state_label", "city_label"], dropna=False)
        .agg(
            latitude=("latitude", "median"),
            longitude=("longitude", "median"),
            total_leads=("lead_id", "count"),
            high_quality_leads=("is_high_quality", "sum"),
            contactable_leads=("is_contactable", "sum"),
            decision_maker_leads=("has_contact", "sum"),
            container_ready_leads=("is_container_ready", "sum"),
            average_b2b_score=("b2b_score", "mean"),
            quality_value=("quality_weight", "sum"),
        )
        .reset_index()
        .rename(columns={"state_label": "state", "city_label": "city"})
    )

    result["average_b2b_score"] = result["average_b2b_score"].round(1)
    result["display_name"] = result["city"] + ", " + result["state"]
    result["radius"] = (result["total_leads"].pow(0.55) * 18000).clip(18000, 180000)
    result["elevation"] = (result["quality_value"] * 7).clip(100, 12000)

    max_score = max(float(result["average_b2b_score"].max()), 1.0)
    score_ratio = (result["average_b2b_score"] / max_score).clip(0, 1)
    result["fill_color"] = score_ratio.apply(
        lambda ratio: [int(40 + ratio * 20), int(100 + ratio * 120), int(130 - ratio * 70), 190]
    )

    return result


def build_h3_summary(df: pd.DataFrame, resolution: int) -> pd.DataFrame:
    geocoded = df[df["is_geocoded"]].copy()
    if geocoded.empty:
        return pd.DataFrame()

    geocoded["h3_index"] = [
        h3.latlng_to_cell(float(lat), float(lon), int(resolution))
        for lat, lon in zip(geocoded["latitude"], geocoded["longitude"])
    ]

    result = (
        geocoded.groupby("h3_index", dropna=False)
        .agg(
            total_leads=("lead_id", "count"),
            high_quality_leads=("is_high_quality", "sum"),
            contactable_leads=("is_contactable", "sum"),
            decision_maker_leads=("has_contact", "sum"),
            container_ready_leads=("is_container_ready", "sum"),
            average_b2b_score=("b2b_score", "mean"),
            quality_value=("quality_weight", "sum"),
            country=("country", lambda x: x.mode().iloc[0] if not x.mode().empty else ""),
            state=("state", lambda x: x.mode().iloc[0] if not x.mode().empty else ""),
            city=("city", lambda x: x.mode().iloc[0] if not x.mode().empty else ""),
        )
        .reset_index()
    )

    result["average_b2b_score"] = result["average_b2b_score"].round(1)
    result["display_name"] = result["city"].where(result["city"].ne(""), result["state"]).where(
        lambda x: x.ne(""), result["country"]
    )
    result["elevation"] = (result["quality_value"] * 10).clip(100, 16000)

    max_value = max(float(result["quality_value"].max()), 1.0)
    ratio = (result["quality_value"] / max_value).clip(0, 1)
    result["fill_color"] = ratio.apply(
        lambda value: [int(40 + value * 210), int(170 - value * 70), int(210 - value * 170), 185]
    )

    return result


def map_view_state(df: pd.DataFrame, country: str, state: str, city: str) -> pdk.ViewState:
    geocoded = df[df["is_geocoded"]]

    if geocoded.empty:
        return pdk.ViewState(latitude=20, longitude=0, zoom=1.2, pitch=35, bearing=0)

    latitude = float(geocoded["latitude"].median())
    longitude = float(geocoded["longitude"].median())

    if city != "All / 全部":
        zoom = 10
    elif state != "All / 全部":
        zoom = 6.2
    elif country != "All / 全部":
        zoom = 4.2
    else:
        zoom = 1.3

    return pdk.ViewState(
        latitude=latitude,
        longitude=longitude,
        zoom=zoom,
        pitch=42,
        bearing=0,
    )


def plotly_selected_country(event: Any) -> str:
    if event is None:
        return ""

    try:
        points = event.selection.points
    except Exception:
        try:
            points = event.get("selection", {}).get("points", [])
        except Exception:
            points = []

    if not points:
        return ""

    point = points[0]
    customdata = point.get("customdata", []) if isinstance(point, dict) else getattr(point, "customdata", [])
    if isinstance(customdata, (list, tuple)) and customdata:
        return safe_text(customdata[0])
    return ""


def pydeck_selected_object(event: Any) -> dict[str, Any]:
    if event is None:
        return {}

    try:
        objects = event.selection.objects
    except Exception:
        try:
            objects = event.get("selection", {}).get("objects", {})
        except Exception:
            objects = {}

    if isinstance(objects, dict):
        for layer_objects in objects.values():
            if isinstance(layer_objects, list) and layer_objects:
                selected = layer_objects[0]
                if isinstance(selected, dict):
                    return selected
    return {}


def render_gis_dashboard(all_leads: pd.DataFrame) -> None:
    st.markdown("### GIS Lead Intelligence / GIS 线索情报")
    st.caption(
        "Country → state/province → city → company drill-down, quality concentration, territory gaps, and data-quality control. "
        "/ 国家 → 州省 → 城市 → 公司逐级分析，高质量线索聚集、区域空白及地理数据质量监控。"
    )

    gis = normalize_gis_dataframe(all_leads)
    if gis.empty:
        st.info("No lead data is available. / 暂无线索数据。")
        return

    missing_required = [column for column in ["lead_id", "country"] if column not in gis.columns]
    if missing_required:
        st.error(
            "GIS requires these columns: " + ", ".join(missing_required)
            + ". Run the supplied Supabase migration and ensure fetch_all_leads() selects them."
        )
        return

    if "gis_country" not in st.session_state:
        st.session_state.gis_country = "All / 全部"
    if "gis_state" not in st.session_state:
        st.session_state.gis_state = "All / 全部"
    if "gis_city" not in st.session_state:
        st.session_state.gis_city = "All / 全部"

    # Apply map-click drill-down before the widgets are instantiated.
    # Streamlit does not allow changing a widget's own key after creation.
    pending_country = safe_text(st.session_state.pop("gis_pending_country", ""))
    pending_state = safe_text(st.session_state.pop("gis_pending_state", ""))
    pending_city = safe_text(st.session_state.pop("gis_pending_city", ""))
    if pending_country:
        st.session_state.gis_country = pending_country
        st.session_state.gis_state = "All / 全部"
        st.session_state.gis_city = "All / 全部"
    if pending_state:
        st.session_state.gis_state = pending_state
        st.session_state.gis_city = "All / 全部"
    if pending_city:
        st.session_state.gis_city = pending_city

    with st.container(border=True):
        filter_row_1 = st.columns([1.15, 1.15, 1.15, 1.0, 1.0])

        country_options = ["All / 全部"] + dataframe_options(gis, "country")
        if st.session_state.gis_country not in country_options:
            st.session_state.gis_country = "All / 全部"

        with filter_row_1[0]:
            selected_country = st.selectbox(
                "Country / 国家",
                country_options,
                key="gis_country",
            )

        country_slice = gis if selected_country == "All / 全部" else gis[gis["country"] == selected_country]
        state_options = ["All / 全部"] + dataframe_options(country_slice, "state")
        if st.session_state.gis_state not in state_options:
            st.session_state.gis_state = "All / 全部"

        with filter_row_1[1]:
            selected_state = st.selectbox(
                "State / Province / 州省",
                state_options,
                key="gis_state",
            )

        state_slice = country_slice if selected_state == "All / 全部" else country_slice[country_slice["state"] == selected_state]
        city_options = ["All / 全部"] + dataframe_options(state_slice, "city")
        if st.session_state.gis_city not in city_options:
            st.session_state.gis_city = "All / 全部"

        with filter_row_1[2]:
            selected_city = st.selectbox(
                "City / 城市",
                city_options,
                key="gis_city",
            )

        with filter_row_1[3]:
            map_mode = st.selectbox(
                "Map mode / 地图模式",
                [
                    "Quality concentration / 质量聚集",
                    "City clusters / 城市聚集",
                    "Individual leads / 单条线索",
                ],
            )

        with filter_row_1[4]:
            metric_label = st.selectbox(
                "Country metric / 国家指标",
                [
                    "Total leads / 线索总数",
                    "High-quality leads / 高质量线索",
                    "Quality value / 质量价值",
                    "Average B2B score / 平均B2B评分",
                    "Unclaimed priority / 未认领优先线索",
                ],
            )

        filter_row_2 = st.columns([1.1, 1.1, 1.1, 1.0, 1.0, 1.0])

        with filter_row_2[0]:
            statuses = st.multiselect(
                "Lead status / 线索状态",
                dataframe_options(gis, "lead_status"),
            )
        with filter_row_2[1]:
            account_tiers = st.multiselect(
                "Account tier / 客户等级",
                dataframe_options(gis, "account_tier"),
            )
        with filter_row_2[2]:
            pvc_statuses = st.multiselect(
                "PVC fit / 产品匹配",
                dataframe_options(gis, "pvc_fit_status"),
            )
        with filter_row_2[3]:
            minimum_score = st.slider(
                "Minimum B2B score / 最低评分",
                min_value=0,
                max_value=100,
                value=0,
                step=5,
            )
        with filter_row_2[4]:
            only_high_quality = st.checkbox("High quality only / 仅高质量")
            only_unclaimed = st.checkbox("Unclaimed only / 仅未认领")
        with filter_row_2[5]:
            only_contactable = st.checkbox("Contactable only / 仅可联系")
            show_3d = st.checkbox("3D elevation / 3D高度", value=True)

    filtered = apply_gis_filters(
        gis,
        country=selected_country,
        state=selected_state,
        city=selected_city,
        statuses=statuses,
        account_tiers=account_tiers,
        pvc_statuses=pvc_statuses,
        minimum_score=minimum_score,
        only_high_quality=only_high_quality,
        only_unclaimed=only_unclaimed,
        only_contactable=only_contactable,
    )

    geocoded = filtered[filtered["is_geocoded"]].copy()
    high_quality_count = int(filtered["is_high_quality"].sum()) if not filtered.empty else 0
    contactable_count = int((filtered["has_email"] | filtered["has_phone"] | filtered["has_contact"]).sum()) if not filtered.empty else 0
    container_ready_count = int(filtered["is_container_ready"].sum()) if not filtered.empty else 0
    geocode_rate = (len(geocoded) / len(filtered) * 100) if len(filtered) else 0.0

    kpi_columns = st.columns(6)
    kpi_columns[0].metric("Filtered leads / 筛选线索", f"{len(filtered):,}")
    kpi_columns[1].metric("Countries / 国家", f"{filtered['country'].replace('', pd.NA).nunique(dropna=True):,}")
    kpi_columns[2].metric("High quality / 高质量", f"{high_quality_count:,}")
    kpi_columns[3].metric("Contactable / 可联系", f"{contactable_count:,}")
    kpi_columns[4].metric("Container ready / 整柜潜力", f"{container_ready_count:,}")
    kpi_columns[5].metric("Geocoded / 已定位", f"{geocode_rate:.1f}%")

    if filtered.empty:
        st.warning("No leads match the selected filters. / 当前筛选条件下无线索。")
        return

    country_summary = aggregate_countries(filtered)
    metric_map = {
        "Total leads / 线索总数": "total_leads",
        "High-quality leads / 高质量线索": "high_quality_leads",
        "Quality value / 质量价值": "quality_value",
        "Average B2B score / 平均B2B评分": "average_b2b_score",
        "Unclaimed priority / 未认领优先线索": "unclaimed_priority",
    }
    metric_column = metric_map[metric_label]

    left, right = st.columns([1.42, 0.88], gap="large")

    with left:
        st.markdown("#### Global Market Distribution / 全球市场分布")
        valid_country_summary = country_summary[country_summary["country_iso3"].str.len() == 3].copy()

        if valid_country_summary.empty:
            st.info(
                "No valid ISO-3 country codes are available. Fill country_iso3 or use standard country names. "
                "/ 暂无有效国家代码，请补充 country_iso3 或统一国家名称。"
            )
        else:
            fig = px.choropleth(
                valid_country_summary,
                locations="country_iso3",
                color=metric_column,
                hover_name="country",
                custom_data=["country"],
                hover_data={
                    "country_iso3": False,
                    "total_leads": ":,",
                    "high_quality_leads": ":,",
                    "container_ready_leads": ":,",
                    "average_b2b_score": ":.1f",
                    "contact_coverage_pct": ":.1f",
                    "geocode_coverage_pct": ":.1f",
                    metric_column: True,
                },
                projection="natural earth",
            )
            fig.update_layout(
                clickmode="event+select",
                margin=dict(l=0, r=0, t=5, b=0),
                height=520,
                coloraxis_colorbar_title=metric_label.split(" / ")[0],
            )
            country_event = st.plotly_chart(
                fig,
                width="stretch",
                on_select="rerun",
                selection_mode="points",
                key="gis_country_choropleth",
            )
            clicked_country = plotly_selected_country(country_event)
            if clicked_country and clicked_country != st.session_state.gis_country:
                st.session_state.gis_pending_country = clicked_country
                st.rerun()

    with right:
        st.markdown("#### Top Markets / 重点市场")
        ranking_columns = [
            "country",
            "total_leads",
            "high_quality_leads",
            "container_ready_leads",
            "average_b2b_score",
            "unclaimed_priority",
            "contact_coverage_pct",
        ]
        ranking = country_summary.sort_values(
            [metric_column, "high_quality_leads"], ascending=False
        )[ranking_columns].head(15)
        st.dataframe(
            ranking,
            hide_index=True,
            width="stretch",
            height=480,
            column_config={
                "country": "Country / 国家",
                "total_leads": st.column_config.NumberColumn("Leads / 线索", format="%d"),
                "high_quality_leads": st.column_config.NumberColumn("High quality / 高质量", format="%d"),
                "container_ready_leads": st.column_config.NumberColumn("Container / 整柜", format="%d"),
                "average_b2b_score": st.column_config.NumberColumn("Avg score / 均分", format="%.1f"),
                "unclaimed_priority": st.column_config.NumberColumn("Priority gap / 优先空白", format="%d"),
                "contact_coverage_pct": st.column_config.ProgressColumn(
                    "Contact % / 联系覆盖",
                    min_value=0,
                    max_value=100,
                    format="%.1f%%",
                ),
            },
        )

    st.markdown("#### Geographic Drill-down / 地理下钻")

    if geocoded.empty:
        st.warning(
            "The selected leads have no valid latitude/longitude coordinates. Run the SQL migration, then populate coordinates before using the detailed map. "
            "/ 当前线索没有有效经纬度。请先执行 SQL 并补充坐标。"
        )
    else:
        layers: list[pdk.Layer] = []

        if map_mode == "Quality concentration / 质量聚集":
            if selected_city != "All / 全部":
                h3_resolution = 9
            elif selected_state != "All / 全部":
                h3_resolution = 7
            elif selected_country != "All / 全部":
                h3_resolution = 6
            else:
                h3_resolution = 4

            h3_summary = build_h3_summary(geocoded, h3_resolution)
            layers.append(
                pdk.Layer(
                    "H3HexagonLayer",
                    data=h3_summary,
                    id="quality-h3-layer",
                    get_hexagon="h3_index",
                    get_fill_color="fill_color",
                    get_elevation="elevation" if show_3d else 0,
                    elevation_scale=1,
                    extruded=show_3d,
                    pickable=True,
                    auto_highlight=True,
                    opacity=0.78,
                    coverage=0.88,
                )
            )

        elif map_mode == "City clusters / 城市聚集":
            city_summary = aggregate_cities(geocoded)
            layers.append(
                pdk.Layer(
                    "ScatterplotLayer",
                    data=city_summary,
                    id="city-cluster-layer",
                    get_position="[longitude, latitude]",
                    get_radius="radius",
                    get_fill_color="fill_color",
                    get_line_color=[255, 255, 255, 220],
                    line_width_min_pixels=1,
                    stroked=True,
                    filled=True,
                    pickable=True,
                    auto_highlight=True,
                    radius_min_pixels=8,
                    radius_max_pixels=55,
                )
            )
            if show_3d:
                layers.append(
                    pdk.Layer(
                        "ColumnLayer",
                        data=city_summary,
                        id="city-column-layer",
                        get_position="[longitude, latitude]",
                        get_elevation="elevation",
                        elevation_scale=1,
                        radius=16000,
                        get_fill_color="fill_color",
                        pickable=True,
                        auto_highlight=True,
                        extruded=True,
                    )
                )

        else:
            individual = geocoded.copy()
            individual["display_name"] = individual["name"].where(
                nonempty_text(individual["name"]), individual["city"]
            )
            score_ratio = (individual["b2b_score"].clip(0, 100) / 100).fillna(0)
            individual["fill_color"] = score_ratio.apply(
                lambda value: [int(55 + value * 200), int(170 - value * 90), int(210 - value * 170), 205]
            )
            individual["radius"] = (individual["b2b_score"].clip(lower=20) * 115).clip(2500, 14000)

            layers.append(
                pdk.Layer(
                    "ScatterplotLayer",
                    data=individual,
                    id="individual-lead-layer",
                    get_position="[longitude, latitude]",
                    get_radius="radius",
                    get_fill_color="fill_color",
                    get_line_color=[255, 255, 255, 230],
                    line_width_min_pixels=1,
                    stroked=True,
                    filled=True,
                    pickable=True,
                    auto_highlight=True,
                    radius_min_pixels=4,
                    radius_max_pixels=22,
                )
            )

        deck = pdk.Deck(
            map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
            initial_view_state=map_view_state(filtered, selected_country, selected_state, selected_city),
            layers=layers,
            tooltip={
                "html": """
                    <b>{display_name}</b><br/>
                    Country: {country}<br/>
                    State: {state}<br/>
                    Leads: {total_leads}<br/>
                    High quality: {high_quality_leads}<br/>
                    Average B2B score: {average_b2b_score}<br/>
                    Container ready: {container_ready_leads}<br/>
                    Contactable: {contactable_leads}<br/>
                    Quality value: {quality_value}<br/>
                    Account tier: {account_tier}<br/>
                    PVC fit: {pvc_fit_status}<br/>
                    Lead status: {lead_status}
                """,
                "style": {
                    "backgroundColor": "#0f172a",
                    "color": "white",
                    "fontSize": "12px",
                },
            },
        )

        map_event = st.pydeck_chart(
            deck,
            width="stretch",
            height=650,
            on_select="rerun",
            selection_mode="single-object",
            key="gis_detail_map",
        )
        selected_object = pydeck_selected_object(map_event)

        if selected_object:
            clicked_country = safe_text(selected_object.get("country"))
            clicked_state = safe_text(selected_object.get("state"))
            clicked_city = safe_text(selected_object.get("city"))

            changed = False
            if clicked_country and clicked_country in country_options and clicked_country != st.session_state.gis_country:
                st.session_state.gis_pending_country = clicked_country
                changed = True
            if clicked_state and clicked_state not in ["Unknown state"] and clicked_state != st.session_state.gis_state:
                st.session_state.gis_pending_state = clicked_state
                changed = True
            if clicked_city and clicked_city not in ["Unknown city"] and clicked_city != st.session_state.gis_city:
                st.session_state.gis_pending_city = clicked_city
                changed = True
            if changed:
                st.rerun()

    city_summary = aggregate_cities(filtered)
    if not city_summary.empty:
        city_left, city_right = st.columns([1.1, 0.9], gap="large")
        with city_left:
            st.markdown("#### Top Cities / 重点城市")
            top_cities = city_summary.sort_values(
                ["quality_value", "high_quality_leads"], ascending=False
            ).head(20)
            st.dataframe(
                top_cities[
                    [
                        "country",
                        "state",
                        "city",
                        "total_leads",
                        "high_quality_leads",
                        "container_ready_leads",
                        "average_b2b_score",
                        "quality_value",
                    ]
                ],
                hide_index=True,
                width="stretch",
                height=440,
            )

        with city_right:
            st.markdown("#### Opportunity Signals / 市场机会信号")
            opportunity = country_summary.copy()
            if not opportunity.empty:
                max_quality = max(float(opportunity["quality_value"].max()), 1.0)
                max_priority = max(float(opportunity["unclaimed_priority"].max()), 1.0)
                opportunity["opportunity_score"] = (
                    opportunity["quality_value"] / max_quality * 45
                    + opportunity["unclaimed_priority"] / max_priority * 30
                    + opportunity["contact_coverage_pct"] / 100 * 15
                    + opportunity["geocode_coverage_pct"] / 100 * 10
                ).round(1)
                opportunity = opportunity.sort_values("opportunity_score", ascending=False).head(15)
                st.dataframe(
                    opportunity[
                        [
                            "country",
                            "opportunity_score",
                            "unclaimed_priority",
                            "high_quality_leads",
                            "contact_coverage_pct",
                            "geocode_coverage_pct",
                        ]
                    ],
                    hide_index=True,
                    width="stretch",
                    height=440,
                    column_config={
                        "opportunity_score": st.column_config.ProgressColumn(
                            "Opportunity / 机会分",
                            min_value=0,
                            max_value=100,
                            format="%.1f",
                        )
                    },
                )

    st.markdown("#### Filtered Lead Records / 筛选线索明细")
    gis_table_columns = [
        column
        for column in [
            "lead_id",
            "name",
            "country",
            "state",
            "city",
            "account_tier",
            "b2b_score",
            "container_readiness",
            "pvc_fit_status",
            "contact_full_name",
            "contact_job_title",
            "email",
            "phone",
            "website",
            "lead_status",
            "owner",
            "latitude",
            "longitude",
        ]
        if column in filtered.columns
    ]
    st.dataframe(
        filtered.sort_values(["is_high_quality", "b2b_score"], ascending=False)[gis_table_columns],
        hide_index=True,
        width="stretch",
        height=500,
        column_config=lead_column_config(),
    )

    with st.expander("GIS data-quality audit / GIS 数据质量检查"):
        total = len(gis)
        missing_country = int((~nonempty_text(gis["country"])).sum())
        missing_state = int((~nonempty_text(gis["state"])).sum())
        missing_city = int((~nonempty_text(gis["city"])).sum())
        missing_coordinates = int((~gis["is_geocoded"]).sum())
        missing_iso = int(gis["country_iso3"].str.len().ne(3).sum())
        duplicate_coordinates = int(
            gis.loc[gis["is_geocoded"], ["latitude", "longitude"]].duplicated(keep=False).sum()
        )

        quality_df = pd.DataFrame(
            [
                {"issue / 问题": "Missing country / 缺国家", "count / 数量": missing_country},
                {"issue / 问题": "Missing state / 缺州省", "count / 数量": missing_state},
                {"issue / 问题": "Missing city / 缺城市", "count / 数量": missing_city},
                {"issue / 问题": "Missing or invalid coordinates / 坐标缺失或无效", "count / 数量": missing_coordinates},
                {"issue / 问题": "Missing ISO-3 code / 缺国家代码", "count / 数量": missing_iso},
                {"issue / 问题": "Repeated exact coordinates / 完全重复坐标", "count / 数量": duplicate_coordinates},
            ]
        )
        quality_df["share / 占比"] = (quality_df["count / 数量"] / max(total, 1) * 100).round(1)
        st.dataframe(quality_df, hide_index=True, width="stretch")

        if full_data_allowed:
            export = filtered.to_csv(index=False).encode("utf-8-sig")
            st.download_button(
                "Download GIS-filtered leads / 下载GIS筛选线索",
                data=export,
                file_name="gis_filtered_leads.csv",
                mime="text/csv",
                width="stretch",
            )


# ============================================================
# SESSION STATE
# ============================================================

if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

if "user" not in st.session_state:
    st.session_state.user = None


# ============================================================
# HEADER
# ============================================================

render_header()


# ============================================================
# LOGIN PAGE
# ============================================================

if not st.session_state.logged_in:
    hero_left, hero_right = st.columns([1.12, 0.88], gap="large")

    with hero_left:
        st.markdown(
            """
            <div class="hero-card">
                <div class="badge">Internal Portal · BI & Sales Operations / 内部门户 · BI与销售运营</div>
                <div class="hero-title">B2B Flooring Lead Distribution / B2B地面材料销售线索分配</div>
                <div class="hero-subtitle">
                    Access qualified flooring distributor and wholesale leads selected by the BI team.
                    Claim leads, manage ownership, and manage Brazil market opportunities.
                    <br><br>
                    获取由 BI 团队筛选的高质量地面材料分销商与批发商线索。
                    认领线索、管理负责人，并管理巴西市场。
                </div>
                <div class="hero-note">
                    This portal replaces uncontrolled CSV sharing with role-based and traceable lead access.
                    <br>
                    本系统用于替代缺乏管控的 CSV 共享，实现基于角色的可追溯线索访问。
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with hero_right:
        st.markdown(
            """
            <div class="login-box">
                <div class="login-title">Welcome Back / 欢迎回来</div>
                <div class="login-text">
                    Log in to view available leads, claim new opportunities, and manage your assigned accounts.
                    <br>
                    登录后可查看可用线索、认领新商机，并管理您负责的客户。
                </div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login_form"):
            email = st.text_input("Email / 邮箱", placeholder="name@platform.com")
            password = st.text_input("Password / 密码", type="password", placeholder="Password / 密码")
            submitted = st.form_submit_button("Login / 登录")

            if submitted:
                user = authenticate(email, password)

                if user:
                    login_user(user)
                    st.rerun()
                else:
                    st.error("Invalid email or password. / 邮箱或密码错误。")

        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown(
        """
        <div class="footer">
            B2B Flooring Lead Portal · Internal Sales Intelligence System · Built by BI Team
            <br>
            B2B 地面材料商机线索门户 · 内部销售情报系统 · 由 BI 团队构建
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.stop()


# ============================================================
# LOGGED-IN APP
# ============================================================

user = st.session_state.user
role = str(user.get("role", "sales_rep")).strip().lower()

summary_allowed = can_view_summary(user)
claim_allowed = can_claim_leads(user)
full_data_allowed = can_download_all_data(user)

st.success(
    f"Logged in / 当前登录：{user['name']} · {role_label(role)} · {user['email']}"
)

try:
    available = fetch_available_leads()
    my_leads = fetch_my_leads(user["email"])

    available = ensure_market_column(available)
    my_leads = ensure_market_column(my_leads)

    available = normalize_dataframe_for_display(available)
    my_leads = normalize_dataframe_for_display(my_leads)

    if summary_allowed:
        all_leads = fetch_all_leads()
        claim_summary = fetch_claim_summary()
        claim_log = fetch_claim_log()

        all_leads = ensure_market_column(all_leads)
        all_leads = normalize_dataframe_for_display(all_leads)
        claim_summary = normalize_dataframe_for_display(claim_summary)
        claim_log = normalize_dataframe_for_display(claim_log)
    else:
        all_leads = pd.DataFrame()
        claim_summary = pd.DataFrame()
        claim_log = pd.DataFrame()

except Exception as exc:
    st.error("Could not load data from Supabase. / 无法从 Supabase 加载数据。")
    st.exception(exc)
    st.stop()


# ============================================================
# KPI ROW
# ============================================================

if summary_allowed:
    total_leads = len(all_leads)
    available_count = len(available)
    claimed_count = (
        int((all_leads["lead_status"] == "claimed").sum())
        if not all_leads.empty and "lead_status" in all_leads.columns
        else 0
    )
    my_count = len(my_leads)

    kpi1, kpi2, kpi3, kpi4 = st.columns(4)

    with kpi1:
        st.metric("Total Leads / 线索总数", total_leads)

    with kpi2:
        st.metric("Available Leads / 可用线索", available_count)

    with kpi3:
        st.metric("Claimed Leads / 已认领线索", claimed_count)

    with kpi4:
        st.metric("My Leads / 我的线索", my_count)

else:
    kpi1, kpi2 = st.columns(2)

    with kpi1:
        st.metric("Available Leads / 可用线索", len(available))

    with kpi2:
        st.metric("My Leads / 我的线索", len(my_leads))


# ============================================================
# TABS
# ============================================================

if summary_allowed:
    tab_available, tab_my, tab_admin, tab_gis = st.tabs(
        [
            "Available Leads / 可用线索",
            "My Leads / 我的线索",
            "Admin Summary / 管理汇总",
            "GIS Intelligence / GIS地理情报",
        ]
    )
else:
    tab_available, tab_my = st.tabs(
        [
            "Available Leads / 可用线索",
            "My Leads / 我的线索",
        ]
    )
    tab_admin = None
    tab_gis = None


# ============================================================
# AVAILABLE LEADS
# ============================================================

with tab_available:
    st.markdown("### Available Sales-Ready Leads / 可用高质量销售线索")
    st.caption(
        "Select leads using the checkbox, then click Claim Selected Leads. "
        "/ 勾选线索后，点击“认领所选线索”。"
    )

    if available.empty:
        st.info("No available leads. / 暂无可用线索。")
    else:
        filtered = available.copy()

        filter_col1, filter_col2, filter_col3 = st.columns([1, 1, 2])

        with filter_col1:
            if "market" in filtered.columns:
                market_options = ["All / 全部"] + sorted(
                    filtered["market"]
                    .replace("", pd.NA)
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                )

                selected_market = st.selectbox(
                    "Market / 市场",
                    market_options,
                )

                if selected_market != "All / 全部":
                    filtered = filtered[filtered["market"].astype(str) == selected_market]

        with filter_col2:
            if "state" in filtered.columns:
                state_options = ["All / 全部"] + sorted(
                    filtered["state"]
                    .replace("", pd.NA)
                    .dropna()
                    .astype(str)
                    .unique()
                    .tolist()
                )

                selected_state = st.selectbox(
                    "State / 州",
                    state_options,
                )

                if selected_state != "All / 全部":
                    filtered = filtered[filtered["state"].astype(str) == selected_state]

        with filter_col3:
            search_text = st.text_input(
                "Search company, city, website, phone, or email / 搜索公司、城市、网站、电话或邮箱"
            )

        if search_text:
            searchable_cols = [
                col
                for col in [
                    "market",
                    "name",
                    "parent_company",
                    "company_domain",
                    "city",
                    "state",
                    "website",
                    "phone",
                    "email",
                    "contact_full_name",
                    "contact_job_title",
                    "account_tier",
                    "pvc_fit_status",
                ]
                if col in filtered.columns
            ]

            if searchable_cols:
                search_blob = (
                    filtered[searchable_cols]
                    .fillna("")
                    .astype(str)
                    .agg(" ".join, axis=1)
                    .str.lower()
                )

                filtered = filtered[
                    search_blob.str.contains(search_text.lower(), na=False)
                ]

        if "lead_id" not in filtered.columns:
            st.error(
                "System error: lead_id is missing from Supabase data. "
                "/ 系统错误：Supabase 数据中缺少 lead_id。"
            )
            st.stop()

        display_cols = [
            col for col in AVAILABLE_LEAD_COLUMNS if col in filtered.columns
        ]

        view = filtered[display_cols].copy()
        view.insert(0, "claim", False)

        if not claim_allowed:
            st.info("Your role can view leads but cannot claim them. / 您的角色可以查看线索，但不能认领。")

        edited = st.data_editor(
            view,
            hide_index=True,
            use_container_width=True,
            disabled=[col for col in display_cols] + ([] if claim_allowed else ["claim"]),
            column_config=lead_column_config(include_claim=True),
        )

        selected = edited[edited["claim"] == True].copy()

        if claim_allowed:
            if st.button("Claim Selected Leads / 认领所选线索", use_container_width=True):
                if selected.empty:
                    st.warning("No leads selected. / 尚未选择任何线索。")

                elif "lead_id" not in selected.columns:
                    st.error(
                        "System error: lead_id is missing from the selected table. "
                        "/ 系统错误：所选表格缺少 lead_id。"
                    )

                else:
                    selected_lead_ids = (
                        selected["lead_id"]
                        .dropna()
                        .astype(str)
                        .str.strip()
                        .tolist()
                    )

                    selected_lead_ids = [
                        lead_id for lead_id in selected_lead_ids if lead_id
                    ]

                    if not selected_lead_ids:
                        st.warning("Selected rows have no lead_id. / 所选行没有 lead_id。")
                    else:
                        result = claim_many_leads(
                            lead_ids=selected_lead_ids,
                            user_email=user["email"],
                            user_name=user["name"],
                        )

                        claimed = result.get("claimed", 0)
                        failed = result.get("failed", 0)

                        if claimed > 0:
                            st.success(
                                f"Claimed {claimed} lead(s). / 成功认领 {claimed} 条线索。"
                            )

                        if failed > 0:
                            st.warning(
                                f"{failed} lead(s) could not be claimed. They may already be taken. "
                                f"/ {failed} 条线索无法认领，可能已被他人认领。"
                            )

                        st.rerun()


# ============================================================
# MY LEADS
# ============================================================

with tab_my:
    st.markdown("### My Claimed Leads / 我的已认领线索")

    if my_leads.empty:
        st.info("You have not claimed any leads yet. / 您还没有认领任何线索。")
    else:
        my_display_cols = [
            col for col in MY_LEAD_COLUMNS if col in my_leads.columns
        ]

        st.dataframe(
            my_leads[my_display_cols],
            hide_index=True,
            use_container_width=True,
            column_config=lead_column_config(),
        )

        csv = my_leads.to_csv(index=False).encode("utf-8-sig")

        st.download_button(
            label="Download My Claimed Leads / 下载我的已认领线索",
            data=csv,
            file_name=f"my_claimed_leads_{user['email'].replace('@', '_at_')}.csv",
            mime="text/csv",
            use_container_width=True,
        )


# ============================================================
# ADMIN SUMMARY
# ============================================================

if summary_allowed and tab_admin is not None:
    with tab_admin:
        st.markdown("### Admin Summary / 管理汇总")

        if all_leads.empty:
            st.info("No leads available. / 暂无线索数据。")
        else:
            market_summary = (
                all_leads
                .groupby("market", dropna=False)
                .agg(
                    total_leads=("lead_id", "count"),
                    available_leads=("lead_status", lambda x: (x == "available").sum()),
                    claimed_leads=("lead_status", lambda x: (x == "claimed").sum()),
                    leads_with_email=("email", lambda x: x.fillna("").astype(str).str.strip().ne("").sum()),
                )
                .reset_index()
            )

            st.markdown("#### Market Summary / 市场汇总")
            st.dataframe(
                market_summary,
                hide_index=True,
                use_container_width=True,
            )

            col1, col2 = st.columns(2)

            with col1:
                st.markdown("#### Lead Status / 线索状态")

                if "lead_status" in all_leads.columns:
                    lead_status_summary = (
                        all_leads["lead_status"]
                        .fillna("unknown")
                        .value_counts()
                        .reset_index()
                    )

                    lead_status_summary.columns = ["lead_status / 线索状态", "count / 数量"]

                    st.dataframe(
                        lead_status_summary,
                        hide_index=True,
                        use_container_width=True,
                    )

            with col2:
                st.markdown("#### Email Coverage / 邮箱覆盖情况")

                if "email" in all_leads.columns:
                    email_count = (
                        all_leads["email"]
                        .fillna("")
                        .astype(str)
                        .str.strip()
                        .ne("")
                        .sum()
                    )

                    no_email_count = len(all_leads) - email_count

                    email_summary = pd.DataFrame(
                        [
                            {
                                "metric / 指标": "With Email / 有邮箱",
                                "count / 数量": int(email_count),
                            },
                            {
                                "metric / 指标": "Without Email / 无邮箱",
                                "count / 数量": int(no_email_count),
                            },
                        ]
                    )

                    st.dataframe(
                        email_summary,
                        hide_index=True,
                        use_container_width=True,
                    )

            st.markdown("#### Leads Claimed by User / 按用户统计认领数量")

            if claim_summary.empty:
                st.info("No claims have been made yet. / 目前还没有任何认领记录。")
            else:
                st.dataframe(
                    claim_summary,
                    hide_index=True,
                    use_container_width=True,
                )

            st.markdown("#### Full Claim Log / 完整认领记录")

            if claim_log.empty:
                st.info("No claim log yet. / 暂无认领日志。")
            else:
                st.dataframe(
                    claim_log,
                    hide_index=True,
                    use_container_width=True,
                )

            if full_data_allowed:
                st.markdown("#### Full Leads Export / 完整线索导出")

                csv_all = all_leads.to_csv(index=False).encode("utf-8-sig")

                st.download_button(
                    label="Download All Leads / 下载全部线索",
                    data=csv_all,
                    file_name="all_leads_export.csv",
                    mime="text/csv",
                    use_container_width=True,
                )


# ============================================================
# GIS INTELLIGENCE
# ============================================================

if summary_allowed and tab_gis is not None:
    with tab_gis:
        render_gis_dashboard(all_leads)


# ============================================================
# LOGOUT
# ============================================================

st.markdown("---")

if st.button("Log out / 退出登录"):
    logout_user()
    st.rerun()
