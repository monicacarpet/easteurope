from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

WORKBOOK_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"a": WORKBOOK_NS, "r": REL_NS}

SOURCE_SHEET = "Stock Upload"
ACTIVE_EFFECTIVE_DATE: date | None = None
SOURCE_PRICE_REFERENCE = ""
PRICE_EFFECTIVE_DATE = ""
MIN_PROMOTIONAL_AREA_M2: float | None = None
PRICE_SCHEDULE: dict[str, float] = {}


def resolve_effective_date(value: str) -> date:
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError as exc:
        raise argparse.ArgumentTypeError("--effective-date must be YYYY-MM-DD") from exc


def load_price_config(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    schedule = data.get("price_schedule_cny_per_m2")
    if not isinstance(schedule, dict) or not schedule:
        raise ValueError("--price-config must provide price_schedule_cny_per_m2")
    minimum = data.get("minimum_promotional_area_m2")
    if minimum is None or float(minimum) <= 0:
        raise ValueError("--price-config must provide a positive minimum_promotional_area_m2")
    return data


def configured_effective_date() -> date:
    if ACTIVE_EFFECTIVE_DATE is None:
        raise RuntimeError("Effective date has not been configured")
    return ACTIVE_EFFECTIVE_DATE


def configured_minimum_area() -> float:
    if MIN_PROMOTIONAL_AREA_M2 is None:
        raise RuntimeError("Minimum promotional area has not been configured")
    return float(MIN_PROMOTIONAL_AREA_M2)


HEADERS = [
    "serial_no",
    "stock_market",
    "process_type",
    "sku",
    "specification",
    "top_layer",
    "surface_no",
    "area_m2",
    "thickness_label",
    "pieces",
    "boxes",
    "cases",
    "single_piece_area_m2",
    "source_remark",
    "material_type",
    "finished_category",
]


def clean(value: Any) -> str:
    return str(value or "").strip()


def numeric(value: Any) -> float | None:
    text = clean(value).replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def int_or_none(value: Any) -> int | None:
    number = numeric(value)
    if number is None:
        return None
    return int(number)


def normalize_market(value: Any) -> str:
    market = clean(value).lower()
    if market in {"外销", "export", "exports", "export stock", "export_stock", "overseas"}:
        return "外销"
    if market in {"内销", "domestic", "china", "domestic stock", "domestic_stock"}:
        return "内销"
    return clean(value)


def slug(value: str, limit: int = 42) -> str:
    text = unicodedata.normalize("NFKD", clean(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").lower()
    return (text or "unnamed")[:limit]


def sql_string(value: Any) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql_number(value: float | int | None) -> str:
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    rendered = f"{float(value):.8f}".rstrip("0").rstrip(".")
    return rendered or "0"


def column_number(column: str) -> int:
    value = 0
    for char in column:
        value = value * 26 + ord(char) - 64
    return value


def read_xlsx_rows(path: Path, sheet_name: str = SOURCE_SHEET) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", NS):
                shared_strings.append(
                    "".join(
                        text_node.text or ""
                        for text_node in item.iter(f"{{{WORKBOOK_NS}}}t")
                    )
                )

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_map = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships
        }
        worksheet_target = ""
        sheets_node = workbook.find("a:sheets", NS)
        for sheet in list(sheets_node) if sheets_node is not None else []:
            if sheet.attrib.get("name") == sheet_name:
                relation_id = sheet.attrib[f"{{{REL_NS}}}id"]
                worksheet_target = relationship_map[relation_id]
                break
        if not worksheet_target:
            raise ValueError(f"Worksheet not found: {sheet_name}")
        worksheet_target = worksheet_target.lstrip("/")
        if not worksheet_target.startswith("xl/"):
            worksheet_target = f"xl/{worksheet_target}"

        sheet_root = ET.fromstring(archive.read(worksheet_target))
        output: list[dict[str, Any]] = []
        for row_node in sheet_root.findall(".//a:sheetData/a:row", NS):
            source_row = int(row_node.attrib["r"])
            if source_row == 1:
                continue
            cells: dict[int, Any] = {}
            for cell in row_node.findall("a:c", NS):
                match = re.match(r"([A-Z]+)(\d+)", cell.attrib["r"])
                if not match:
                    continue
                column = column_number(match.group(1))
                if column > len(HEADERS):
                    continue
                cell_type = cell.attrib.get("t")
                value_node = cell.find("a:v", NS)
                value: Any = ""
                if cell_type == "s" and value_node is not None:
                    value = shared_strings[int(value_node.text or "0")]
                elif cell_type == "inlineStr":
                    value = "".join(
                        text_node.text or ""
                        for text_node in cell.iter(f"{{{WORKBOOK_NS}}}t")
                    )
                elif value_node is not None:
                    value = value_node.text or ""
                cells[column] = value
            values = [cells.get(index, "") for index in range(1, len(HEADERS) + 1)]
            if not any(clean(value) for value in values):
                continue
            record = dict(zip(HEADERS, values))
            record["source_row"] = source_row
            output.append(record)
        return output


def parse_thickness_mm(record: dict[str, Any]) -> float | None:
    match = re.match(r"\s*(\d+(?:\.\d+)?)", clean(record.get("thickness_label")))
    if match:
        return float(match.group(1))
    numbers = re.findall(r"\d+(?:\.\d+)?", clean(record.get("specification")))
    return float(numbers[2]) if len(numbers) >= 3 else None


def parse_wear_layer_mm(record: dict[str, Any]) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", clean(record.get("top_layer")))
    return float(match.group(0)) if match else None


def base_dimensions(record: dict[str, Any]) -> tuple[float, float] | None:
    base = clean(record.get("specification")).upper().split("+", 1)[0]
    numbers = re.findall(r"\d+(?:\.\d+)?", base)
    if len(numbers) < 2:
        return None
    return float(numbers[0]), float(numbers[1])


def public_format(record: dict[str, Any]) -> str:
    dimensions = base_dimensions(record)
    if not dimensions:
        return clean(record.get("specification"))
    width, length = dimensions
    unit = "inch" if width <= 60 and length <= 100 else "mm"

    def display(number: float) -> str:
        return str(int(number)) if number.is_integer() else f"{number:g}"

    return f"{display(width)} × {display(length)} {unit}"


def format_family(record: dict[str, Any]) -> str:
    dimensions = base_dimensions(record)
    if not dimensions:
        return "plank"
    width, length = dimensions
    if min(width, length) <= 0:
        return "plank"
    return "plank" if max(width, length) / min(width, length) >= 1.8 else "tile"


def texture_family(record: dict[str, Any]) -> str:
    label = clean(record.get("thickness_label"))
    if "木纹" in label:
        return "wood-look"
    if "石纹" in label:
        return "stone-look"
    if "毯纹" in label:
        return "carpet-look"
    if "柳叶纹" in label:
        return "decorative-pattern"
    return "decorative"


def has_ixpe(record: dict[str, Any]) -> bool:
    return "IXPE" in clean(record.get("specification")).upper()


def pricing_rule(record: dict[str, Any]) -> tuple[str, float] | None:
    process = clean(record.get("process_type"))
    thickness = parse_thickness_mm(record)
    ixpe = has_ixpe(record)
    if thickness is None:
        return None

    def configured_price(key: str) -> tuple[str, float] | None:
        value = PRICE_SCHEDULE.get(key)
        return (key, float(value)) if value is not None else None

    # Conservative rule: unsupported product/process combinations remain
    # imported but disabled until management supplies an approved price.
    if process == "LVT":
        if thickness in {2.0, 2.5, 3.0}:
            key = f"LVT_{thickness:.1f}"
            return configured_price(key)
        if thickness == 4.0 and not ixpe:
            key = "LVT_4.0_NO_IXPE"
            return configured_price(key)
    if process == "SPC":
        if thickness == 4.0:
            key = "SPC_4.0_WITH_IXPE" if ixpe else "SPC_4.0_NO_IXPE"
            return configured_price(key)
        if thickness == 5.0:
            key = "SPC_5.0_WITH_IXPE" if ixpe else "SPC_5.0_NO_IXPE"
            return configured_price(key)
    if process == "免胶" or "loose" in process.lower():
        if thickness == 4.0:
            return configured_price("LOOSE_LAY_4.0")
        if thickness == 5.0:
            return configured_price("LOOSE_LAY_5.0")
    return None


def product_type(record: dict[str, Any]) -> str:
    process = clean(record.get("process_type"))
    return {
        "免胶": "Loose-lay vinyl",
        "LVT（背胶）": "Self-adhesive LVT",
        "La-LVT": "Laminated LVT",
    }.get(process, process or "Flooring")


def public_description(record: dict[str, Any]) -> str:
    thickness = parse_thickness_mm(record)
    thickness_text = f"{thickness:g} mm" if thickness is not None else ""
    backing = " with IXPE backing" if has_ixpe(record) else ""
    return " ".join(
        part
        for part in [
            thickness_text,
            product_type(record),
            texture_family(record),
            format_family(record),
        ]
        if part
    ) + backing


def promotion_reason(record: dict[str, Any], price_rule: tuple[str, float] | None) -> str:
    area = numeric(record.get("area_m2")) or 0.0
    market = clean(record.get("stock_market"))
    process = clean(record.get("process_type"))
    if market != "外销":
        return "Not enabled: workbook marks this row as domestic stock (内销)."
    if area < configured_minimum_area():
        return f"Not enabled: stock lot is below the {configured_minimum_area():g} m² campaign minimum."
    if price_rule is None:
        return f"Not enabled: no exact approved campaign price for process {process} and this thickness/backing combination."
    return (
        f"Enabled: export stock, at least {configured_minimum_area():g} m², "
        "and an exact price category confirmed by the client's approved price schedule."
    )


@dataclass
class NormalizedStock:
    inventory_snapshot_id: str
    source_file: str
    source_sheet: str
    source_row: int
    source_sha256: str
    effective_date: str
    item_id: str
    serial_no: str
    stock_market: str
    process_type: str
    sku: str
    specification: str
    top_layer: str
    surface_no: str
    area_m2: float
    thickness_label: str
    thickness_mm: float | None
    wear_layer_mm: float | None
    pieces: int | None
    boxes: int | None
    cases: float | None
    single_piece_area_m2: float | None
    source_remark: str
    material_type: str
    finished_category: str
    format_family: str
    texture_family: str
    has_ixpe: bool
    public_format: str
    product_type: str
    public_product_description: str
    exact_quantity_display: str
    pricing_rule: str
    target_price_cny_m2: float | None
    promotion_enabled: bool
    promotion_reason: str


def normalize_rows(path: Path) -> tuple[str, list[NormalizedStock]]:
    source_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    snapshot_id = f"inventory_{configured_effective_date():%Y%m%d}_{source_sha256[:8]}"
    normalized: list[NormalizedStock] = []
    for record in read_xlsx_rows(path):
        record["stock_market"] = normalize_market(record.get("stock_market"))
        area = numeric(record.get("area_m2")) or 0.0
        row = int(record["source_row"])
        sku = clean(record.get("sku"))
        rule = pricing_rule(record)
        reason = promotion_reason(record, rule)
        enabled = reason.startswith("Enabled:")
        normalized.append(
            NormalizedStock(
                inventory_snapshot_id=snapshot_id,
                source_file=path.name,
                source_sheet=SOURCE_SHEET,
                source_row=row,
                source_sha256=source_sha256,
                effective_date=configured_effective_date().isoformat(),
                item_id=f"{snapshot_id}_r{row}_{slug(sku)}",
                serial_no=clean(record.get("serial_no")),
                stock_market=clean(record.get("stock_market")),
                process_type=clean(record.get("process_type")),
                sku=sku,
                specification=clean(record.get("specification")),
                top_layer=clean(record.get("top_layer")),
                surface_no=clean(record.get("surface_no")),
                area_m2=area,
                thickness_label=clean(record.get("thickness_label")),
                thickness_mm=parse_thickness_mm(record),
                wear_layer_mm=parse_wear_layer_mm(record),
                pieces=int_or_none(record.get("pieces")),
                boxes=int_or_none(record.get("boxes")),
                cases=numeric(record.get("cases")),
                single_piece_area_m2=numeric(record.get("single_piece_area_m2")),
                source_remark=clean(record.get("source_remark")),
                material_type=clean(record.get("material_type")),
                finished_category=clean(record.get("finished_category")),
                format_family=format_family(record),
                texture_family=texture_family(record),
                has_ixpe=has_ixpe(record),
                public_format=public_format(record),
                product_type=product_type(record),
                public_product_description=public_description(record),
                exact_quantity_display=f"{area:,.2f} m²",
                pricing_rule=rule[0] if rule else "",
                target_price_cny_m2=rule[1] if rule else None,
                promotion_enabled=enabled,
                promotion_reason=reason,
            )
        )
    return snapshot_id, normalized


def write_csv(rows: list[NormalizedStock], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(asdict(rows[0]).keys()) if rows else []
    with output_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def summary(snapshot_id: str, rows: list[NormalizedStock]) -> dict[str, Any]:
    enabled = [row for row in rows if row.promotion_enabled]
    export_rows = [row for row in rows if row.stock_market == "外销"]
    domestic_rows = [row for row in rows if row.stock_market == "内销"]
    return {
        "inventory_snapshot_id": snapshot_id,
        "source_file": rows[0].source_file if rows else "",
        "source_sha256": rows[0].source_sha256 if rows else "",
        "effective_date": configured_effective_date().isoformat(),
        "row_count": len(rows),
        "total_area_m2": round(sum(row.area_m2 for row in rows), 8),
        "export_row_count": len(export_rows),
        "export_area_m2": round(sum(row.area_m2 for row in export_rows), 8),
        "domestic_row_count": len(domestic_rows),
        "domestic_area_m2": round(sum(row.area_m2 for row in domestic_rows), 8),
        "promotional_item_count": len(enabled),
        "promotional_area_m2": round(sum(row.area_m2 for row in enabled), 8),
        "minimum_promotional_area_m2": configured_minimum_area(),
        "price_schedule_cny_per_m2": PRICE_SCHEDULE,
        "promotion_policy": {
            "stock_market": "外销 only",
            "minimum_area_m2": configured_minimum_area(),
            "exact_price_required": True,
            "unsupported_processes_are_imported_but_disabled": True,
        },
    }


def write_sql(snapshot_id: str, rows: list[NormalizedStock], output_path: Path) -> None:
    meta = summary(snapshot_id, rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = [
        "-- Platform Stock Campaign V1.7 - current inventory snapshot",
        "-- Generated from the input workbook supplied via --input.",
        "-- This transaction touches only stock inventory/campaign configuration tables.",
        "-- It does not modify leads or existing email history.",
        "",
        "begin;",
        "",
        "create extension if not exists pgcrypto;",
        "",
        "create table if not exists public.stock_inventory_snapshots (",
        "    inventory_snapshot_id text primary key,",
        "    source_file text not null,",
        "    source_sheet text not null,",
        "    source_sha256 text not null,",
        "    effective_date date not null,",
        "    row_count integer not null,",
        "    total_area_m2 numeric not null,",
        "    export_row_count integer not null,",
        "    export_area_m2 numeric not null,",
        "    domestic_row_count integer not null,",
        "    domestic_area_m2 numeric not null,",
        "    promotional_item_count integer not null,",
        "    promotional_area_m2 numeric not null,",
        "    is_active boolean not null default false,",
        "    created_at timestamptz not null default now(),",
        "    activated_at timestamptz",
        ");",
        "",
        "-- Complete base table definition so this file also works on a fresh Supabase project.",
        "create table if not exists public.stock_items (",
        "    item_id text primary key,",
        "    inventory_snapshot_id text,",
        "    source_file text,",
        "    source_sheet text,",
        "    source_row integer,",
        "    source_flag text,",
        "    source_sha256 text,",
        "    source_effective_date date,",
        "    customer_code text,",
        "    source_order_no text,",
        "    sku text not null,",
        "    offer_group text not null,",
        "    product_type text not null,",
        "    format text,",
        "    specification text,",
        "    thickness_mm numeric,",
        "    wear_layer_mm numeric,",
        "    uv_finish text,",
        "    available_pieces numeric,",
        "    available_boxes numeric,",
        "    available_cases numeric,",
        "    estimated_area_m2 numeric,",
        "    stock_market text,",
        "    surface_no text,",
        "    top_layer text,",
        "    single_piece_area_m2 numeric,",
        "    source_remark text,",
        "    material_type text,",
        "    finished_category text,",
        "    format_family text,",
        "    texture_family text,",
        "    has_ixpe boolean,",
        "    pricing_rule text,",
        "    price_status text not null default 'not_set',",
        "    target_price numeric,",
        "    price_currency text,",
        "    price_unit text,",
        "    incoterm text,",
        "    moq_m2 numeric,",
        "    price_note text,",
        "    price_updated_at timestamptz,",
        "    price_tax_included boolean,",
        "    price_tax_rate numeric,",
        "    freight_included boolean,",
        "    price_source text,",
        "    price_effective_date date,",
        "    promotional_price_label text,",
        "    exact_quantity_display text,",
        "    exact_price_display text,",
        "    price_conditions_display text,",
        "    scarcity_type text,",
        "    scarcity_statement text,",
        "    immediate_availability_statement text,",
        "    public_product_description text,",
        "    public_format text,",
        "    public_thickness text,",
        "    public_wear_layer text,",
        "    promotional_priority integer not null default 50,",
        "    promotional_email_enabled boolean not null default false,",
        "    interest_check_enabled boolean not null default false,",
        "    availability_status text not null default 'manual_review',",
        "    last_inventory_confirmed_at timestamptz,",
        "    inventory_confirmed_by text,",
        "    internal_note text,",
        "    created_at timestamptz not null default now(),",
        "    updated_at timestamptz not null default now()",
        ");",
        "",
        "-- Idempotent upgrades for repositories that already have an older stock table.",
        "alter table public.stock_items add column if not exists inventory_snapshot_id text;",
        "alter table public.stock_items add column if not exists stock_market text;",
        "alter table public.stock_items add column if not exists source_sha256 text;",
        "alter table public.stock_items add column if not exists source_effective_date date;",
        "alter table public.stock_items add column if not exists surface_no text;",
        "alter table public.stock_items add column if not exists top_layer text;",
        "alter table public.stock_items add column if not exists single_piece_area_m2 numeric;",
        "alter table public.stock_items add column if not exists source_remark text;",
        "alter table public.stock_items add column if not exists material_type text;",
        "alter table public.stock_items add column if not exists finished_category text;",
        "alter table public.stock_items add column if not exists format_family text;",
        "alter table public.stock_items add column if not exists texture_family text;",
        "alter table public.stock_items add column if not exists has_ixpe boolean;",
        "alter table public.stock_items add column if not exists pricing_rule text;",
        "alter table public.stock_items add column if not exists price_status text not null default 'not_set';",
        "alter table public.stock_items add column if not exists target_price numeric;",
        "alter table public.stock_items add column if not exists price_currency text;",
        "alter table public.stock_items add column if not exists price_unit text;",
        "alter table public.stock_items add column if not exists incoterm text;",
        "alter table public.stock_items add column if not exists moq_m2 numeric;",
        "alter table public.stock_items add column if not exists price_note text;",
        "alter table public.stock_items add column if not exists price_updated_at timestamptz;",
        "alter table public.stock_items add column if not exists price_tax_included boolean;",
        "alter table public.stock_items add column if not exists price_tax_rate numeric;",
        "alter table public.stock_items add column if not exists freight_included boolean;",
        "alter table public.stock_items add column if not exists price_source text;",
        "alter table public.stock_items add column if not exists price_effective_date date;",
        "alter table public.stock_items add column if not exists promotional_price_label text;",
        "alter table public.stock_items add column if not exists exact_quantity_display text;",
        "alter table public.stock_items add column if not exists exact_price_display text;",
        "alter table public.stock_items add column if not exists price_conditions_display text;",
        "alter table public.stock_items add column if not exists scarcity_type text;",
        "alter table public.stock_items add column if not exists scarcity_statement text;",
        "alter table public.stock_items add column if not exists immediate_availability_statement text;",
        "alter table public.stock_items add column if not exists public_product_description text;",
        "alter table public.stock_items add column if not exists public_format text;",
        "alter table public.stock_items add column if not exists public_thickness text;",
        "alter table public.stock_items add column if not exists public_wear_layer text;",
        "alter table public.stock_items add column if not exists promotional_priority integer not null default 50;",
        "alter table public.stock_items add column if not exists promotional_email_enabled boolean not null default false;",
        "alter table public.stock_items add column if not exists interest_check_enabled boolean not null default false;",
        "alter table public.stock_items add column if not exists availability_status text not null default 'manual_review';",
        "alter table public.stock_items add column if not exists last_inventory_confirmed_at timestamptz;",
        "alter table public.stock_items add column if not exists inventory_confirmed_by text;",
        "alter table public.stock_items add column if not exists internal_note text;",
        "alter table public.stock_items add column if not exists created_at timestamptz not null default now();",
        "alter table public.stock_items add column if not exists updated_at timestamptz not null default now();",
        "",
        "create table if not exists public.stock_campaign_matches (",
        "    id uuid primary key default gen_random_uuid(),",
        "    campaign_id text not null,",
        "    lead_id text not null references public.leads(lead_id) on delete cascade,",
        "    offer_group text,",
        "    selected_item_id text,",
        "    status text not null default 'candidate',",
        "    fit_reason text,",
        "    website_fact text,",
        "    website_fact_source_url text,",
        "    buyer_need_inference text,",
        "    match_score integer,",
        "    category_fit_score integer,",
        "    last_subject text,",
        "    last_contacted_at timestamptz,",
        "    created_at timestamptz not null default now(),",
        "    updated_at timestamptz not null default now(),",
        "    unique (campaign_id, lead_id)",
        ");",
        "alter table public.stock_campaign_matches add column if not exists selected_item_id text;",
        "alter table public.stock_campaign_matches add column if not exists match_score integer;",
        "alter table public.stock_campaign_matches add column if not exists category_fit_score integer;",
        "alter table public.stock_campaign_matches add column if not exists website_fact_source_url text;",
        "alter table public.stock_campaign_matches add column if not exists buyer_need_inference text;",
        "",
        "-- Campaign sender/limits are intentionally not modified by this offline inventory builder.",
        "",
        "-- Deactivate every previous inventory snapshot and every previous promotional row.",
        "update public.stock_inventory_snapshots set is_active=false where is_active=true;",
        "update public.stock_items",
        "set promotional_email_enabled=false, interest_check_enabled=false,",
        "    availability_status='superseded_inventory_snapshot', updated_at=now()",
        "where coalesce(inventory_snapshot_id,'') <> " + sql_string(snapshot_id) + ";",
        "",
        "insert into public.stock_inventory_snapshots (",
        "    inventory_snapshot_id, source_file, source_sheet, source_sha256, effective_date,",
        "    row_count, total_area_m2, export_row_count, export_area_m2,",
        "    domestic_row_count, domestic_area_m2, promotional_item_count,",
        "    promotional_area_m2, is_active, activated_at",
        ") values (",
        f"    {sql_string(snapshot_id)}, {sql_string(meta['source_file'])}, {sql_string(SOURCE_SHEET)},",
        f"    {sql_string(meta['source_sha256'])}, {sql_string(meta['effective_date'])}::date,",
        f"    {meta['row_count']}, {sql_number(meta['total_area_m2'])},",
        f"    {meta['export_row_count']}, {sql_number(meta['export_area_m2'])},",
        f"    {meta['domestic_row_count']}, {sql_number(meta['domestic_area_m2'])},",
        f"    {meta['promotional_item_count']}, {sql_number(meta['promotional_area_m2'])},",
        "    true, now()",
        ") on conflict (inventory_snapshot_id) do update set",
        "    source_file=excluded.source_file, source_sheet=excluded.source_sheet,",
        "    source_sha256=excluded.source_sha256, effective_date=excluded.effective_date,",
        "    row_count=excluded.row_count, total_area_m2=excluded.total_area_m2,",
        "    export_row_count=excluded.export_row_count, export_area_m2=excluded.export_area_m2,",
        "    domestic_row_count=excluded.domestic_row_count, domestic_area_m2=excluded.domestic_area_m2,",
        "    promotional_item_count=excluded.promotional_item_count,",
        "    promotional_area_m2=excluded.promotional_area_m2, is_active=true, activated_at=now();",
        "",
        "-- Replace only this snapshot's rows; historical rows from older snapshots stay archived and disabled.",
        "delete from public.stock_items where inventory_snapshot_id=" + sql_string(snapshot_id) + ";",
        "",
        "insert into public.stock_items (",
        "    item_id, inventory_snapshot_id, source_file, source_sheet, source_row, source_flag,",
        "    source_sha256, source_effective_date, sku, offer_group, product_type, format,",
        "    specification, thickness_mm, wear_layer_mm, available_pieces, available_boxes,",
        "    available_cases, estimated_area_m2, stock_market, surface_no, top_layer,",
        "    single_piece_area_m2, source_remark, material_type, finished_category,",
        "    format_family, texture_family, has_ixpe, pricing_rule,",
        "    price_status, target_price, price_currency, price_unit, price_tax_included,",
        "    price_tax_rate, freight_included, price_source, price_effective_date,",
        "    promotional_price_label, exact_quantity_display, exact_price_display,",
        "    price_conditions_display, scarcity_type, scarcity_statement,",
        "    immediate_availability_statement, public_product_description, public_format,",
        "    public_thickness, public_wear_layer, promotional_priority,",
        "    promotional_email_enabled, interest_check_enabled, availability_status,",
        "    last_inventory_confirmed_at, inventory_confirmed_by, internal_note, updated_at",
        ") values",
    ]

    value_lines: list[str] = []
    for row in rows:
        offer_group = "_".join(
            [
                slug(row.product_type, 20),
                row.format_family,
                str(row.thickness_mm or "unknown").replace(".", "_"),
                str(row.wear_layer_mm or "unknown").replace(".", "_"),
            ]
        )
        price_confirmed = row.target_price_cny_m2 is not None
        priority = min(99, max(40, int(40 + min(row.area_m2, 3000) / 60)))
        availability = "promotional_ready" if row.promotion_enabled else "inventory_only"
        exact_price = (
            f"RMB {row.target_price_cny_m2:g}/m²" if price_confirmed else ""
        )
        price_conditions = (
            "including 13% tax, freight excluded" if price_confirmed else ""
        )
        values = [
            sql_string(row.item_id),
            sql_string(row.inventory_snapshot_id),
            sql_string(row.source_file),
            sql_string(row.source_sheet),
            str(row.source_row),
            sql_string(row.stock_market),
            sql_string(row.source_sha256),
            sql_string(row.effective_date) + "::date",
            sql_string(row.sku),
            sql_string(offer_group),
            sql_string(row.product_type),
            sql_string(row.public_format),
            sql_string(row.specification),
            sql_number(row.thickness_mm),
            sql_number(row.wear_layer_mm),
            sql_number(row.pieces),
            sql_number(row.boxes),
            sql_number(row.cases),
            sql_number(row.area_m2),
            sql_string(row.stock_market),
            sql_string(row.surface_no),
            sql_string(row.top_layer),
            sql_number(row.single_piece_area_m2),
            sql_string(row.source_remark),
            sql_string(row.material_type),
            sql_string(row.finished_category),
            sql_string(row.format_family),
            sql_string(row.texture_family),
            "true" if row.has_ixpe else "false",
            sql_string(row.pricing_rule),
            sql_string("confirmed" if price_confirmed else "not_set"),
            sql_number(row.target_price_cny_m2),
            sql_string("CNY" if price_confirmed else None),
            sql_string("m2" if price_confirmed else None),
            "true" if price_confirmed else "null",
            "13" if price_confirmed else "null",
            "false" if price_confirmed else "null",
            sql_string(SOURCE_PRICE_REFERENCE if price_confirmed else None),
            sql_string(PRICE_EFFECTIVE_DATE) + "::date" if price_confirmed and PRICE_EFFECTIVE_DATE else "null",
            sql_string("Approved clearance-stock price" if price_confirmed else None),
            sql_string(row.exact_quantity_display),
            sql_string(exact_price),
            sql_string(price_conditions),
            sql_string("one_off_lot" if row.promotion_enabled else None),
            sql_string(
                "This is a one-off lot; once allocated, it will not be replenished automatically."
                if row.promotion_enabled
                else None
            ),
            sql_string(
                "The lot can be allocated without waiting for a new production run."
                if row.promotion_enabled
                else None
            ),
            sql_string(row.public_product_description),
            sql_string(row.public_format),
            sql_string(f"{row.thickness_mm:g} mm" if row.thickness_mm is not None else ""),
            sql_string(f"{row.wear_layer_mm:g} mm" if row.wear_layer_mm is not None else ""),
            str(priority),
            "true" if row.promotion_enabled else "false",
            "false",
            sql_string(availability),
            "now()",
            sql_string(f"{row.source_file} / snapshot {row.inventory_snapshot_id}"),
            sql_string(row.promotion_reason),
            "now()",
        ]
        value_lines.append("(" + ",".join(values) + ")")
    lines.append(",\n".join(value_lines) + ";")
    lines.extend(
        [
            "",
            "-- Defensive shutdown: no row may send unless every required control is complete.",
            "update public.stock_items",
            "set promotional_email_enabled=false, availability_status='inventory_only', updated_at=now()",
            "where inventory_snapshot_id=" + sql_string(snapshot_id),
            "  and promotional_email_enabled=true",
            "  and (",
            "      stock_market <> '外销'",
            f"      or estimated_area_m2 < {configured_minimum_area():g}",
            "      or coalesce(price_status,'') <> 'confirmed'",
            "      or target_price is null",
            "      or coalesce(exact_quantity_display,'') = ''",
            "      or coalesce(exact_price_display,'') = ''",
            "      or coalesce(price_conditions_display,'') = ''",
            "      or coalesce(scarcity_statement,'') = ''",
            "      or coalesce(public_product_description,'') = ''",
            "  );",
            "",
            "create index if not exists idx_stock_inventory_snapshots_active",
            "    on public.stock_inventory_snapshots (is_active, effective_date desc);",
            "create index if not exists idx_stock_items_snapshot_promo",
            "    on public.stock_items (inventory_snapshot_id, promotional_email_enabled,",
            "        price_status, availability_status, estimated_area_m2 desc);",
            "",
            "create index if not exists idx_stock_campaign_matches_status",
            "    on public.stock_campaign_matches (campaign_id, status, last_contacted_at);",
            "",
            "commit;",
            "",
            "-- Verification: these values must match the workbook snapshot exactly.",
            "select inventory_snapshot_id, source_file, source_sha256, effective_date,",
            "       row_count, total_area_m2, export_row_count, export_area_m2,",
            "       domestic_row_count, domestic_area_m2, promotional_item_count,",
            "       promotional_area_m2, is_active",
            "from public.stock_inventory_snapshots",
            "where inventory_snapshot_id=" + sql_string(snapshot_id) + ";",
            "",
            "select",
            "    count(*) as loaded_rows,",
            "    round(sum(estimated_area_m2)::numeric, 8) as loaded_area_m2,",
            "    count(*) filter (where promotional_email_enabled=true) as promotional_rows,",
            "    round((sum(estimated_area_m2) filter (where promotional_email_enabled=true))::numeric, 8) as promotional_area_m2",
            "from public.stock_items",
            "where inventory_snapshot_id=" + sql_string(snapshot_id) + ";",
            "",
            "select product_type, pricing_rule, count(*) as item_count,",
            "       round(sum(estimated_area_m2)::numeric, 2) as area_m2,",
            "       min(target_price) as price_cny_m2, max(target_price) as price_cny_m2_check",
            "from public.stock_items",
            "where inventory_snapshot_id=" + sql_string(snapshot_id),
            "  and promotional_email_enabled=true",
            "group by product_type, pricing_rule",
            "order by product_type, pricing_rule;",
        ]
    )
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    global ACTIVE_EFFECTIVE_DATE, SOURCE_PRICE_REFERENCE, PRICE_EFFECTIVE_DATE
    global MIN_PROMOTIONAL_AREA_M2, PRICE_SCHEDULE

    parser = argparse.ArgumentParser(
        description="Build an offline Platform stock snapshot. Production UI uploads use the Supabase transactional importer."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--effective-date", required=True, type=resolve_effective_date)
    parser.add_argument("--price-config", required=True, type=Path)
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--sql", required=True, type=Path)
    parser.add_argument("--summary", required=True, type=Path)
    args = parser.parse_args()

    config = load_price_config(args.price_config)
    ACTIVE_EFFECTIVE_DATE = args.effective_date
    SOURCE_PRICE_REFERENCE = str(config.get("price_source") or args.price_config.name)
    PRICE_EFFECTIVE_DATE = str(config.get("price_effective_date") or "")
    MIN_PROMOTIONAL_AREA_M2 = float(config["minimum_promotional_area_m2"])
    PRICE_SCHEDULE = {str(key): float(value) for key, value in config["price_schedule_cny_per_m2"].items()}

    snapshot_id, rows = normalize_rows(args.input)
    write_csv(rows, args.csv)
    write_sql(snapshot_id, rows, args.sql)
    result = summary(snapshot_id, rows)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
