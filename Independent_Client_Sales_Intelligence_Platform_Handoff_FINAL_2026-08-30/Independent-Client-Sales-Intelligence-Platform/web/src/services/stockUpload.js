import readExcelFile from "read-excel-file/browser";

const HEADER_ALIASES = {
  serial_no: ["serial_no", "serial", "序号"],
  stock_market: ["stock_market", "market", "库存市场", "市场", " ", "内外销", "内/外销"],
  process_type: ["process_type", "process", "工艺", "产品工艺"],
  sku: ["sku", "货号", "item", "item_no", "货品编号"],
  specification: ["specification", "spec", "规格"],
  top_layer: ["top_layer", "top", "耐磨层", "耐磨层厚度"],
  surface_no: ["surface_no", "surface", "面料号", "花色号", "颜色号"],
  area_m2: [
    "area_m2",
    "stock_area_m2",
    "area",
    "平方数",
    "库存平方",
    "库存面积",
    "面积m2",
    "面积㎡",
  ],
  thickness_label: ["thickness_label", "厚度", "厚度描述"],
  thickness_mm: ["thickness_mm", "厚度mm"],
  wear_layer_mm: ["wear_layer_mm", "耐磨层mm"],
  pieces: ["pieces", "片数"],
  boxes: ["boxes", "盒数"],
  cases: ["cases", "件数"],
  single_piece_area_m2: ["single_piece_area_m2", "单片面积"],
  source_remark: ["source_remark", "remark", "remarks", "备注"],
  material_type: ["material_type", "料型"],
  finished_category: ["finished_category", "成品类别"],
};

const TEMPLATE_REQUIRED = ["stock_market", "process_type", "sku", "specification", "area_m2"];

function clean(value) {
  return String(value ?? "").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => clean(cell))) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[\s_\-()（）/\\]/g, "");
}

const ALIAS_LOOKUP = Object.entries(HEADER_ALIASES).reduce((acc, [key, values]) => {
  values.forEach((value) => {
    const normalized = normalizedHeader(value);
    if (normalized) acc[normalized] = key;
  });
  return acc;
}, {});

function numeric(value) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function boolFromSpec(specification) {
  return /ixpe/i.test(clean(specification));
}

function parseThickness(specification, thicknessLabel, explicit) {
  const direct = numeric(explicit);
  if (direct != null) return direct;
  const labelMatch = clean(thicknessLabel).match(/(\d+(?:\.\d+)?)/);
  if (labelMatch) return Number(labelMatch[1]);
  const base = clean(specification).toUpperCase().split("+", 1)[0];
  const parts = base.match(/\d+(?:\.\d+)?/g) || [];
  return parts.length >= 3 ? Number(parts[2]) : null;
}

function parseWearLayer(topLayer, explicit) {
  const direct = numeric(explicit);
  if (direct != null) return direct;
  const match = clean(topLayer).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function publicFormat(specification) {
  const base = clean(specification).toUpperCase().split("+", 1)[0];
  const parts = base.match(/\d+(?:\.\d+)?/g) || [];
  if (parts.length < 2) return clean(specification);
  const width = Number(parts[0]);
  const length = Number(parts[1]);
  const unit = width <= 60 && length <= 100 ? "inch" : "mm";
  const display = (value) => (Number.isInteger(value) ? String(value) : String(value));
  return `${display(width)} × ${display(length)} ${unit}`;
}

function formatFamily(specification) {
  const base = clean(specification).toUpperCase().split("+", 1)[0];
  const parts = base.match(/\d+(?:\.\d+)?/g) || [];
  if (parts.length < 2) return "plank";
  const width = Number(parts[0]);
  const length = Number(parts[1]);
  if (!width || !length) return "plank";
  return Math.max(width, length) / Math.min(width, length) >= 1.8 ? "plank" : "tile";
}

function textureFamily(thicknessLabel) {
  const value = clean(thicknessLabel);
  if (value.includes("木纹")) return "wood-look";
  if (value.includes("石纹")) return "stone-look";
  if (value.includes("毯纹")) return "carpet-look";
  if (value.includes("柳叶纹")) return "decorative-pattern";
  return "decorative";
}

function productType(processType) {
  const process = clean(processType);
  if (process === "免胶" || /loose/i.test(process)) return "Loose-lay vinyl";
  if (process === "LVT（背胶）" || /self.?adhesive/i.test(process)) return "Self-adhesive LVT";
  if (process === "La-LVT" || /laminated/i.test(process)) return "Laminated LVT";
  if (/^spc$/i.test(process)) return "SPC";
  if (/^lvt$/i.test(process)) return "LVT";
  return process || "Flooring";
}

function normalizeMarket(value) {
  const market = clean(value).toLowerCase();
  if (["外销", "export", "exports", "export stock", "export_stock", "overseas"].includes(market))
    return "外销";
  if (["内销", "domestic", "china", "domestic stock", "domestic_stock"].includes(market))
    return "内销";
  return clean(value);
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((header, index) => {
    const key = ALIAS_LOOKUP[normalizedHeader(header)];
    if (key && map[key] == null) map[key] = index;
  });
  // Legacy workbook column B intentionally has a blank-looking header.
  if (map.stock_market == null && normalizedHeader(headerRow[2]) === normalizedHeader("工艺"))
    map.stock_market = 1;
  return map;
}

function sourceValue(row, headerMap, key) {
  const index = headerMap[key];
  return index == null ? "" : row[index];
}

function normalizeRow(row, headerMap, sourceRow) {
  const process_type = clean(sourceValue(row, headerMap, "process_type"));
  const specification = clean(sourceValue(row, headerMap, "specification"));
  const thickness_label = clean(sourceValue(row, headerMap, "thickness_label"));
  const top_layer = clean(sourceValue(row, headerMap, "top_layer"));
  const thickness_mm = parseThickness(
    specification,
    thickness_label,
    sourceValue(row, headerMap, "thickness_mm")
  );
  const wear_layer_mm = parseWearLayer(top_layer, sourceValue(row, headerMap, "wear_layer_mm"));
  const has_ixpe = boolFromSpec(specification);
  const format_family = formatFamily(specification);
  const texture_family = textureFamily(thickness_label);
  const product_type = productType(process_type);
  const pieces = numeric(sourceValue(row, headerMap, "pieces"));
  const boxes = numeric(sourceValue(row, headerMap, "boxes"));
  const cases = numeric(sourceValue(row, headerMap, "cases"));
  const single_piece_area_m2 = numeric(sourceValue(row, headerMap, "single_piece_area_m2"));
  const area_m2 = numeric(sourceValue(row, headerMap, "area_m2"));
  const thicknessText = thickness_mm == null ? "" : String(thickness_mm);
  const description = [
    thickness_mm == null ? "" : `${thickness_mm} mm`,
    product_type,
    texture_family,
    format_family,
    has_ixpe ? "with IXPE backing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    source_row: sourceRow,
    serial_no: clean(sourceValue(row, headerMap, "serial_no")),
    stock_market: normalizeMarket(sourceValue(row, headerMap, "stock_market")),
    process_type,
    sku: clean(sourceValue(row, headerMap, "sku")),
    specification,
    top_layer,
    surface_no: clean(sourceValue(row, headerMap, "surface_no")),
    area_m2,
    thickness_label,
    thickness_mm,
    wear_layer_mm,
    pieces,
    boxes,
    cases,
    single_piece_area_m2,
    source_remark: clean(sourceValue(row, headerMap, "source_remark")),
    material_type: clean(sourceValue(row, headerMap, "material_type")),
    finished_category: clean(sourceValue(row, headerMap, "finished_category")),
    format_family,
    texture_family,
    has_ixpe,
    public_format: publicFormat(specification),
    product_type,
    public_product_description: description || `${product_type} stock item`,
    public_thickness: thicknessText ? `${thicknessText} mm` : "",
    public_wear_layer: wear_layer_mm == null ? "" : `${wear_layer_mm} mm`,
  };
}

function validateRows(rows) {
  const errors = [];
  const warnings = [];
  const seenRows = new Set();
  rows.forEach((row) => {
    const label = `Row ${row.source_row}`;
    if (seenRows.has(row.source_row)) errors.push(`${label}: duplicate source row.`);
    seenRows.add(row.source_row);
    if (!row.sku) errors.push(`${label}: SKU / 货号 is required.`);
    if (!row.process_type) errors.push(`${label}: process type / 工艺 is required.`);
    if (!row.specification) errors.push(`${label}: specification / 规格 is required.`);
    if (!(row.area_m2 > 0)) errors.push(`${label}: stock area / 平方数 must be greater than zero.`);
    if (!["外销", "内销"].includes(row.stock_market))
      errors.push(`${label}: market must be 外销 or 内销.`);
    if (row.thickness_mm == null)
      warnings.push(`${label}: thickness could not be derived; pricing may remain unconfirmed.`);
  });
  return { errors, warnings };
}

export async function sha256File(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function parseStockUploadFile(file) {
  const extension = clean(file?.name).split(".").pop().toLowerCase();
  if (extension === "et") {
    throw new Error(
      "Native WPS .et files are not supported reliably. In WPS, use Save As → Excel (.xlsx) or CSV, then upload that file."
    );
  }
  if (!["xlsx", "csv"].includes(extension)) {
    throw new Error("Use an Excel or CSV stock file (.xlsx or .csv).");
  }
  let matrix;
  let sheetName;
  if (extension === "csv") {
    matrix = parseCsv(await file.text());
    sheetName = "CSV";
  } else {
    const sheets = await readExcelFile(file);
    if (!sheets.length) throw new Error("The workbook has no worksheets.");
    const selected =
      sheets.find(({ sheet }) => ["Stock Upload", "库存总表"].includes(sheet)) || sheets[0];
    sheetName = selected.sheet;
    matrix = selected.data;
  }
  if (matrix.length < 2) throw new Error("The selected worksheet has no stock rows.");
  const headerMap = buildHeaderMap(matrix[0]);
  const missing = TEMPLATE_REQUIRED.filter((key) => headerMap[key] == null);
  if (missing.length) {
    throw new Error(
      `The stock file is missing required columns: ${missing.join(
        ", "
      )}. Use the supplied stock upload template.`
    );
  }
  const rows = matrix
    .slice(1)
    .map((row, index) => normalizeRow(row, headerMap, index + 2))
    .filter((row) => row.sku || row.specification || row.area_m2);
  if (!rows.length) throw new Error("No usable stock rows were found.");
  const validation = validateRows(rows);
  const totalArea = rows.reduce((sum, row) => sum + (Number(row.area_m2) || 0), 0);
  const exportRows = rows.filter((row) => row.stock_market === "外销");
  return {
    fileName: file.name,
    sheetName,
    rows,
    ...validation,
    summary: {
      rowCount: rows.length,
      totalArea,
      exportRowCount: exportRows.length,
      exportArea: exportRows.reduce((sum, row) => sum + (Number(row.area_m2) || 0), 0),
    },
  };
}
