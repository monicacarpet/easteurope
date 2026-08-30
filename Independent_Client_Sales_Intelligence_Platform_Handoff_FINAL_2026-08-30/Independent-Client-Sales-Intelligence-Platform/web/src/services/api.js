import { demoMode, supabase } from "lib/supabase";
import { BUSINESS_UTC_OFFSET_HOURS } from "config/brand";

// Dashboard calendar aggregation uses the client-configured business UTC offset.
// P35: stock price and upload policy come from Supabase; the frontend does not duplicate them.

let demoPromise;

async function loadDemo() {
  if (!demoPromise) {
    demoPromise = fetch("/demo/platform-demo.json").then((response) => {
      if (!response.ok) throw new Error("Demo data could not be loaded.");
      return response.json();
    });
  }
  return demoPromise;
}

function errorMessage(error, context = "Supabase request failed") {
  if (!error) return context;
  if (typeof error === "string") return `${context}: ${error}`;

  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  if (parts.length) return `${context}: ${parts.join(" | ")}`;

  try {
    return `${context}: ${JSON.stringify(error)}`;
  } catch (_error) {
    return context;
  }
}

function throwIfError(result, context) {
  if (result?.error) {
    const error = new Error(errorMessage(result.error, context));
    error.code = result.error.code;
    error.details = result.error.details;
    error.hint = result.error.hint;
    throw error;
  }
  return result?.data;
}

function isMissingRelationError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  );
}

async function fetchPaged(table, columns = "*", configure = (query) => query, pageSize = 1000) {
  const rows = [];
  let start = 0;

  while (true) {
    const query = configure(supabase.from(table).select(columns));
    const result = await query.range(start, start + pageSize - 1);
    const page = throwIfError(result, `Reading ${table}`) || [];

    rows.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

async function fetchPagedOptional(
  table,
  columns = "*",
  configure = (query) => query,
  pageSize = 1000
) {
  try {
    return await fetchPaged(table, columns, configure, pageSize);
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn(`${table} is not installed in this Supabase project.`);
      return [];
    }
    throw error;
  }
}

async function fetchRpcPaged(functionName, args = {}, pageSize = 1000) {
  const rows = [];
  let start = 0;

  while (true) {
    const result = await supabase.rpc(functionName, args).range(start, start + pageSize - 1);
    const page = throwIfError(result, `Calling ${functionName}`) || [];

    rows.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

function isBiAdminProfile(profile) {
  return lower(profile?.role) === "bi_admin";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function manualPreferredEmail(row) {
  return text(row?.personal_email || row?.secondary_contact_email || row?.email);
}

function manualPreferredPhone(row) {
  return text(row?.direct_phone || row?.mobile_phone || row?.whatsapp_phone || row?.phone);
}

function isGenericCompanyInbox(email) {
  const value = lower(email);
  const local = value.includes("@") ? value.split("@", 1)[0] : value;
  return [
    "info",
    "contact",
    "sales",
    "office",
    "admin",
    "hello",
    "support",
    "service",
    "commercial",
    "comercial",
    "marketing",
    "orders",
    "order",
    "pedidos",
    "accueil",
    "reception",
    "rezeption",
    "export",
    "general",
    "geral",
    "customer",
    "customerservice",
  ].includes(local);
}

function isDecisionMakerTitle(value) {
  const title = lower(value);
  if (!title) return false;
  const markers = [
    "purchas",
    "procurement",
    "buyer",
    "buying",
    "sourcing",
    "supply chain",
    "category manager",
    "achats",
    "approvisionnement",
    "acheteur",
    "achat",
    "einkauf",
    "beschaffung",
    "inkoop",
    "inkoper",
    "compras",
    "acquisti",
    "acquisto",
    "responsable achats",
    "directeur des achats",
    "ceo",
    "chief executive",
    "president",
    "président",
    "pdg",
    "owner",
    "founder",
    "co-founder",
    "gérant",
    "gerant",
    "gerente",
    "managing director",
    "general manager",
    "geschäftsführer",
    "director",
    "directeur",
    "direttore",
    "directora",
    "commercial director",
    "business development director",
  ];
  return markers.some((marker) => title.includes(marker));
}

function hasNamedDecisionMaker(row) {
  const name = text(row?.contact_full_name || row?.secondary_contact_full_name);
  if (!name) return false;
  const normalized = lower(name);
  if (
    [
      "management",
      "management team",
      "purchasing team",
      "sales team",
      "team",
      "n/a",
      "unknown",
    ].includes(normalized)
  )
    return false;
  return isDecisionMakerTitle(row?.contact_job_title);
}

function hasDecisionMakerContactRoute(row) {
  const email = manualPreferredEmail(row);
  const phone = manualPreferredPhone(row);
  const directEmail = Boolean(email) && !isGenericCompanyInbox(email);
  const directPhone = Boolean(text(row?.direct_phone || row?.mobile_phone || row?.whatsapp_phone));
  return directEmail || directPhone || Boolean(phone);
}

function isLikelyStockBuyer(row) {
  const haystack = lower(
    [
      row?.pvc_fit_status,
      row?.procurement_route,
      row?.account_tier,
      row?.contact_job_title,
      row?.name,
    ].join(" ")
  );
  const positive = [
    "floor",
    "lvt",
    "spc",
    "vinyl",
    "distribut",
    "wholesale",
    "retail",
    "stock",
    "warehouse",
    "project",
    "contract",
    "showroom",
    "dealer",
    "trade",
    "import",
  ];
  return positive.some((marker) => haystack.includes(marker));
}

function isExportClientMarket(value) {
  const normalized = lower(value);
  return (
    !normalized ||
    normalized === "外销" ||
    normalized === "export" ||
    normalized === "exports" ||
    normalized === "export stock" ||
    normalized === "export_stock"
  );
}

function buildClientPriceListItems(rows) {
  return (rows || []).filter(
    (row) =>
      lower(row?.price_status) === "confirmed" &&
      isExportClientMarket(row?.stock_market || row?.source_flag) &&
      Boolean(text(row?.pricing_rule)) &&
      number(row?.target_price) > 0
  );
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + number(row?.[key]), 0);
}

function groupSum(rows, key, valueKey) {
  return Object.values(
    rows.reduce((acc, row) => {
      const label = row?.[key] || "Other";
      if (!acc[label]) acc[label] = { label, value: 0, count: 0 };
      acc[label].value += number(row?.[valueKey]);
      acc[label].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.value - a.value);
}

function snapshotIdentity(row) {
  return text(row?.inventory_snapshot_id || row?.snapshot_id || row?.id);
}

function snapshotTimestamp(row) {
  return row?.effective_date || row?.snapshot_month || row?.created_at || null;
}

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// Shift calendar buckets to the client's business day rather than UTC.
const BUSINESS_UTC_OFFSET_MS = BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000;

function businessShiftedDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + BUSINESS_UTC_OFFSET_MS);
}

function businessDateKey(value) {
  const shifted = businessShiftedDate(value);
  return shifted ? shifted.toISOString().slice(0, 10) : "";
}

function businessMonthStartTimestamp(value = new Date()) {
  const shifted = businessShiftedDate(value);
  if (!shifted) return 0;
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - BUSINESS_UTC_OFFSET_MS;
}

function isPromotionalStock(row) {
  return Boolean(
    row?.promotional_email_enabled ||
      row?.interest_check_enabled ||
      lower(row?.availability_status) === "promotional_ready" ||
      lower(row?.availability_status) === "interest_check_ready"
  );
}

function normalizeCurrentSnapshot(current, items, promotionalItems) {
  const totalArea = sum(items, "estimated_area_m2");
  const promotionalArea = sum(promotionalItems, "estimated_area_m2");

  return {
    ...(current || {}),
    total_area_m2: current?.total_area_m2 == null ? totalArea : number(current.total_area_m2),
    promotional_area_m2:
      current?.promotional_area_m2 == null ? promotionalArea : number(current.promotional_area_m2),
    row_count: current?.row_count == null ? items.length : number(current.row_count),
    promotional_item_count:
      current?.promotional_item_count == null
        ? promotionalItems.length
        : number(current.promotional_item_count),
    effective_date: current?.effective_date || current?.snapshot_month || current?.created_at,
  };
}

function buildComparison(current, previous) {
  if (!current) {
    return { status: "missing_current", deltaArea: null, deltaPct: null, previous: null };
  }

  if (!previous || !number(previous.total_area_m2)) {
    return { status: "baseline_missing", deltaArea: null, deltaPct: null, previous: null };
  }

  const deltaArea = number(current.total_area_m2) - number(previous.total_area_m2);
  const deltaPct = (deltaArea / number(previous.total_area_m2)) * 100;

  return {
    status: deltaPct > 10 ? "stock_pressure" : deltaPct < -10 ? "stock_reduction" : "normal",
    deltaArea,
    deltaPct,
    previous,
  };
}

function stockCampaignIds(campaigns, matches) {
  const ids = new Set();

  matches.forEach((row) => {
    const id = text(row?.campaign_id);
    if (id) ids.add(id);
  });

  campaigns.forEach((row) => {
    const name = lower(row?.name);
    if (name.includes("stock")) {
      const id = text(row?.id);
      if (id) ids.add(id);
    }
  });

  return ids;
}

function isSentOutboundMessage(row) {
  const direction = lower(row?.direction);
  const status = lower(row?.status);
  const subject = text(row?.subject).toUpperCase();

  return direction === "outbound" && status === "sent" && !subject.startsWith("[DRY RUN");
}

function buildStockEmailAnalytics(messages, campaigns, matches, leads) {
  const ids = stockCampaignIds(campaigns, matches);
  const countryByLead = new Map(
    leads.map((row) => [text(row?.lead_id), text(row?.country) || "Unknown"])
  );

  const stockMessages = messages.filter((row) => {
    if (!isSentOutboundMessage(row)) return false;
    if (!ids.size) return false;
    return ids.has(text(row?.campaign_id));
  });

  const monthStart = businessMonthStartTimestamp();

  const thisMonth = stockMessages.filter((row) => toTimestamp(row?.sent_at) >= monthStart);

  const countryMap = new Map();
  thisMonth.forEach((row) => {
    const country = countryByLead.get(text(row?.lead_id)) || "Unknown";
    const existing = countryMap.get(country) || {
      country,
      emails_sent: 0,
      last_sent_at: null,
    };

    existing.emails_sent += 1;
    if (toTimestamp(row?.sent_at) > toTimestamp(existing.last_sent_at)) {
      existing.last_sent_at = row?.sent_at || null;
    }
    countryMap.set(country, existing);
  });

  const dailyMap = new Map();
  stockMessages.forEach((row) => {
    if (!row?.sent_at) return;
    const sentDate = businessDateKey(row.sent_at);
    if (!sentDate) return;
    dailyMap.set(sentDate, (dailyMap.get(sentDate) || 0) + 1);
  });

  const countryEmails = [...countryMap.values()].sort((a, b) => b.emails_sent - a.emails_sent);

  const dailyEmails = [...dailyMap.entries()]
    .map(([sent_date, sent_count]) => ({ sent_date, sent_count }))
    .sort((a, b) => a.sent_date.localeCompare(b.sent_date));

  const lastEmailAt =
    stockMessages
      .map((row) => row?.sent_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

  return {
    sentThisMonth: thisMonth.length,
    countriesReached: countryEmails.length,
    countryEmails,
    dailyEmails,
    lastEmailAt,
  };
}

function buildStockFunnel(matches, sentThisMonth) {
  const funnel = { sent: sentThisMonth, interested: 0, quoted: 0, sold: 0 };

  matches.forEach((row) => {
    const status = lower(row?.status);

    if (/(interest|reply|positive|engaged)/.test(status)) funnel.interested += 1;
    if (/(quote|quoted|quotation|proposal)/.test(status)) funnel.quoted += 1;
    if (/(sold|won|order|closed_won)/.test(status)) funnel.sold += 1;
  });

  return funnel;
}

function outreachIdentity(row) {
  return text(row?.lead_id || row?.recipient_email || row?.provider_message_id || row?.id);
}

function leadCountryMap(leads) {
  return new Map(leads.map((row) => [text(row?.lead_id), text(row?.country) || "Unknown"]));
}

function buildCampaignReachAnalytics(messages, campaigns, matches, leads) {
  const stockIds = stockCampaignIds(campaigns, matches);
  const countries = leadCountryMap(leads);
  const sent = messages.filter(isSentOutboundMessage);

  const now = new Date();
  const businessNow = businessShiftedDate(now);
  const monthStart = businessMonthStartTimestamp(now);
  const chartStart = new Date(
    Date.UTC(businessNow.getUTCFullYear(), businessNow.getUTCMonth(), businessNow.getUTCDate() - 29)
  );

  const daily = new Map();
  for (let index = 0; index < 30; index += 1) {
    const day = new Date(chartStart);
    day.setUTCDate(chartStart.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    daily.set(key, { lead: new Set(), stock: new Set() });
  }

  const leadMonth = new Set();
  const stockMonth = new Set();
  const leadCountries = new Set();
  const stockCountries = new Set();
  let leadEmailsThisMonth = 0;
  let stockEmailsThisMonth = 0;

  sent.forEach((row) => {
    if (!row?.sent_at) return;
    const sentAt = new Date(row.sent_at);
    if (Number.isNaN(sentAt.getTime())) return;

    const campaignId = text(row?.campaign_id);
    const isStock = stockIds.has(campaignId);
    const identity = outreachIdentity(row);
    const dayKey = businessDateKey(sentAt);

    if (daily.has(dayKey) && identity) {
      daily.get(dayKey)[isStock ? "stock" : "lead"].add(identity);
    }

    if (sentAt.getTime() >= monthStart) {
      const country = countries.get(text(row?.lead_id));
      if (isStock) {
        stockEmailsThisMonth += 1;
        if (identity) stockMonth.add(identity);
        if (country) stockCountries.add(country);
      } else {
        leadEmailsThisMonth += 1;
        if (identity) leadMonth.add(identity);
        if (country) leadCountries.add(country);
      }
    }
  });

  return {
    daily: [...daily.entries()].map(([date, value]) => ({
      date,
      lead_reach: value.lead.size,
      stock_reach: value.stock.size,
    })),
    leadReachedThisMonth: leadMonth.size,
    stockReachedThisMonth: stockMonth.size,
    leadCountriesReached: leadCountries.size,
    stockCountriesReached: stockCountries.size,
    leadEmailsThisMonth,
    stockEmailsThisMonth,
  };
}

function leadTimestamp(row) {
  return row?.imported_at || row?.created_at || row?.updated_at || null;
}

function hasDecisionContact(row) {
  return Boolean(text(row?.contact_full_name || row?.contact_name || row?.contact_person));
}

function summarizeLeadQuality(rows) {
  const total = rows.length;
  const usableEmail = rows.filter((row) => text(row?.email)).length;
  const decisionContacts = rows.filter(hasDecisionContact).length;
  const highPriority = rows.filter((row) => number(row?.b2b_score) >= 75).length;
  const geocoded = rows.filter((row) => row?.latitude != null && row?.longitude != null).length;
  const scores = rows
    .map((row) => number(row?.b2b_score))
    .filter((value) => Number.isFinite(value));
  const averageScore = scores.length
    ? scores.reduce((sumValue, value) => sumValue + value, 0) / scores.length
    : 0;

  return {
    total,
    usableEmail,
    decisionContacts,
    highPriority,
    geocoded,
    averageScore,
    emailCoverage: total ? (usableEmail / total) * 100 : 0,
    contactCoverage: total ? (decisionContacts / total) * 100 : 0,
    highPriorityShare: total ? (highPriority / total) * 100 : 0,
    geocodeCoverage: total ? (geocoded / total) * 100 : 0,
  };
}

function leadQualityHistory(rows) {
  const now = new Date();
  const buckets = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 1));
    const cohort = rows.filter((row) => {
      const value = leadTimestamp(row);
      if (!value) return false;
      const timestamp = new Date(value);
      return !Number.isNaN(timestamp.getTime()) && timestamp >= start && timestamp < end;
    });
    const summary = summarizeLeadQuality(cohort);
    buckets.push({
      month: start.toISOString().slice(0, 7),
      ...summary,
    });
  }

  const current = buckets[buckets.length - 1] || summarizeLeadQuality([]);
  const previous = buckets[buckets.length - 2] || summarizeLeadQuality([]);
  const delta = (key) => (previous.total > 0 ? number(current[key]) - number(previous[key]) : null);

  return {
    months: buckets,
    currentMonth: current,
    previousMonth: previous,
    deltas: {
      emailCoverage: delta("emailCoverage"),
      contactCoverage: delta("contactCoverage"),
      highPriorityShare: delta("highPriorityShare"),
      averageScore: delta("averageScore"),
    },
  };
}

function stockFamily(value) {
  const valueText = lower(value);
  if (valueText === "llt" || valueText.includes("loose")) return "LLT";
  if (valueText === "spc" || valueText.includes("spc") || valueText.includes("aba")) return "SPC";
  if (valueText === "lvt" || valueText.includes("lvt")) return "LVT";
  return text(value) || "Other";
}

function familyMixFromItems(items) {
  const groups = new Map();
  items.forEach((row) => {
    const label = stockFamily(row?.product_type);
    const current = groups.get(label) || { label, value: 0, count: 0 };
    current.value += number(row?.estimated_area_m2);
    current.count += 1;
    groups.set(label, current);
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

function buildSummaryStockAnalytics(currentMix, previousItems, matches, allItems) {
  const previousMix = familyMixFromItems(previousItems);
  const previousByFamily = new Map(previousMix.map((row) => [row.label, row]));
  const itemFamily = new Map(
    allItems.map((row) => [text(row?.item_id), stockFamily(row?.product_type)])
  );
  const exposure = new Map();

  matches.forEach((row) => {
    const family = itemFamily.get(text(row?.selected_item_id)) || stockFamily(row?.offer_group);
    if (!family || family === "Other") return;
    const current = exposure.get(family) || { emails: 0, interested: 0, quoted: 0, sold: 0 };
    if (row?.last_contacted_at) current.emails += 1;
    const status = lower(row?.status);
    if (/(interest|reply|positive|engaged)/.test(status)) current.interested += 1;
    if (/(quote|quoted|quotation|proposal)/.test(status)) current.quoted += 1;
    if (/(sold|won|order|closed_won)/.test(status)) current.sold += 1;
    exposure.set(family, current);
  });

  const totalArea = currentMix.reduce((sumValue, row) => sumValue + number(row?.value), 0);
  const movement = currentMix.map((row) => {
    const previous = previousByFamily.get(row.label) || { value: 0, count: 0 };
    const deltaArea = number(row.value) - number(previous.value);
    const deltaPct = number(previous.value) ? (deltaArea / number(previous.value)) * 100 : null;
    const campaign = exposure.get(row.label) || { emails: 0, interested: 0, quoted: 0, sold: 0 };
    return {
      product_group: row.label,
      models: number(row.count),
      area_m2: number(row.value),
      share_pct: totalArea ? (number(row.value) / totalArea) * 100 : 0,
      avg_area_per_model: number(row.count) ? number(row.value) / number(row.count) : 0,
      previous_area_m2: number(previous.value),
      delta_area_m2: deltaArea,
      delta_pct: deltaPct,
      emails_sent: campaign.emails,
      interested: campaign.interested,
      quoted: campaign.quoted,
      sold: campaign.sold,
      priority_score: Math.round(number(row.value) / Math.max(1, campaign.emails + 1)),
    };
  });

  return {
    movement,
    largestFamily: movement[0] || null,
    averageAreaPerModel: movement.reduce((sumValue, row) => sumValue + row.models, 0)
      ? totalArea / movement.reduce((sumValue, row) => sumValue + row.models, 0)
      : 0,
  };
}

function campaignStats(messages, stockIds, countryByLead, mode) {
  const isStockMode = mode === "stock";
  const relevant = messages.filter((row) => {
    const direction = lower(row?.direction);
    const campaignId = text(row?.campaign_id);
    if (direction !== "outbound") return false;
    return isStockMode ? stockIds.has(campaignId) : !stockIds.has(campaignId);
  });
  const sent = relevant.filter(isSentOutboundMessage);
  const failed = relevant.filter((row) => lower(row?.status) === "failed");
  const now = new Date();
  const monthStart = businessMonthStartTimestamp(now);
  const monthSent = sent.filter((row) => toTimestamp(row?.sent_at) >= monthStart);
  const reached = new Set(monthSent.map(outreachIdentity).filter(Boolean));
  const countryCounts = new Map();
  monthSent.forEach((row) => {
    const country = countryByLead.get(text(row?.lead_id)) || "Unknown";
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
  });
  const countries = new Set([...countryCounts.keys()].filter((value) => value !== "Unknown"));
  return {
    sentThisMonth: monthSent.length,
    uniqueReachedThisMonth: reached.size,
    countriesReachedThisMonth: countries.size,
    countryBreakdown: [...countryCounts.entries()]
      .map(([country, sentCount]) => ({ country, sent: sentCount }))
      .sort((a, b) => b.sent - a.sent),
    failedThisMonth: failed.filter(
      (row) => toTimestamp(row?.generated_at || row?.sent_at) >= monthStart
    ).length,
    latestSend:
      sent
        .map((row) => row?.sent_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null,
  };
}

function buildStockActionQueue(promotionalItems, matches, allItems = promotionalItems) {
  const groups = new Map();
  // Stock campaign matches can point at an older inventory snapshot. Keep the
  // exposure classification stable across snapshot refreshes by mapping every
  // loaded historical item id to its product family, while inventory volume
  // still comes only from the current promotional snapshot.
  const itemFamily = new Map(
    (allItems || []).map((item) => [text(item?.item_id), stockFamily(item?.product_type)])
  );

  promotionalItems.forEach((item) => {
    const family = stockFamily(item?.product_type);
    const current = groups.get(family) || {
      product_group: family,
      stock_area_m2: 0,
      stock_items: 0,
      emails_sent: 0,
      interested: 0,
      quoted: 0,
      sold: 0,
    };
    current.stock_area_m2 += number(item?.estimated_area_m2);
    current.stock_items += 1;
    groups.set(family, current);
  });

  matches.forEach((row) => {
    const family =
      itemFamily.get(text(row?.selected_item_id)) ||
      stockFamily(row?.product_type || row?.offer_group);
    if (!groups.has(family)) return;
    const current = groups.get(family);
    if (row?.last_contacted_at) current.emails_sent += 1;
    const status = lower(row?.status);
    if (/(interest|reply|positive|engaged)/.test(status)) current.interested += 1;
    if (/(quote|quoted|quotation|proposal)/.test(status)) current.quoted += 1;
    if (/(sold|won|order|closed_won)/.test(status)) current.sold += 1;
  });

  const rows = [...groups.values()];
  const totalArea = rows.reduce((sumValue, row) => sumValue + number(row.stock_area_m2), 0);

  return rows
    .map((row) => ({
      ...row,
      share_pct: totalArea ? (number(row.stock_area_m2) / totalArea) * 100 : 0,
      avg_area_per_model: row.stock_items ? number(row.stock_area_m2) / number(row.stock_items) : 0,
      priority_score: Math.round(
        number(row.stock_area_m2) / Math.max(1, number(row.emails_sent) + 1)
      ),
    }))
    .sort((a, b) => number(b.stock_area_m2) - number(a.stock_area_m2));
}

async function getCurrentProfile() {
  const userResult = await supabase.auth.getUser();
  if (userResult.error) {
    throw new Error(errorMessage(userResult.error, "Reading authenticated user"));
  }

  const user = userResult.data?.user;
  if (!user) throw new Error("No authenticated Supabase user was found.");

  const profileResult = await supabase.from("app_profiles").select("*").eq("id", user.id).single();

  return throwIfError(profileResult, "Reading Platform application profile");
}

async function getAuthorizedLeadRows({ mine = false, adminAll = false } = {}) {
  const profile = await getCurrentProfile();

  if (mine) {
    const rows = await fetchRpcPaged("get_my_claimed_lead_details", {});
    return rows.map((row) => ({ ...row, _restricted_pool: false }));
  }

  if (isBiAdminProfile(profile)) {
    const rows = await fetchRpcPaged("bi_admin_lead_details", {});
    const visible = adminAll
      ? rows
      : rows.filter(
          (row) =>
            lower(row?.lead_status || "available") === "available" && !text(row?.assigned_to_email)
        );
    return visible.map((row) => ({ ...row, _restricted_pool: false }));
  }

  const rows = await fetchRpcPaged("get_available_lead_pool", {});
  return rows.map((row) => ({ ...row, _restricted_pool: true }));
}

export async function getStockIntelligence() {
  if (demoMode) {
    const demo = await loadDemo();
    const current = demo.stockSnapshots.find((row) => row.is_active) || demo.stockSnapshots[0];
    const previous = demo.stockSnapshots.filter((row) => !row.is_active)[0] || null;
    const items = demo.stockItems;
    const promotionalItems = items.filter((row) => row.promotional_email_enabled);
    const priceConfirmed = items.filter((row) => row.price_status === "confirmed").length;
    const sentThisMonth = demo.countryEmails.reduce(
      (total, row) => total + number(row.emails_sent),
      0
    );
    const productMix = groupSum(items, "product_type", "estimated_area_m2");
    const promoMix = groupSum(promotionalItems, "product_type", "estimated_area_m2");

    return {
      preview: true,
      current,
      snapshots: demo.stockSnapshots,
      items,
      promotionalItems,
      productMix,
      promoMix,
      countryEmails: demo.countryEmails,
      dailyEmails: demo.dailyEmails,
      actionQueue: promoMix.slice(0, 8).map((row, index) => ({
        product_group: row.label,
        stock_area_m2: row.value,
        stock_items: row.count,
        emails_sent: Math.max(0, 7 - index),
        priority_score: Math.round(row.value / Math.max(1, 7 - index)),
      })),
      funnel: { sent: sentThisMonth, interested: 5, quoted: 2, sold: 0 },
      comparison: buildComparison(current, previous),
      priceConfirmed,
      sentThisMonth,
      countriesReached: demo.countryEmails.filter((row) => number(row.emails_sent) > 0).length,
      lastEmailAt:
        demo.countryEmails
          .map((row) => row.last_sent_at)
          .sort()
          .reverse()[0] || null,
      priceListItems: buildClientPriceListItems(items),
      priceListSourceDate: current?.effective_date || null,
      priceListReferenceOnly: false,
      campaignReach: {
        daily: (demo.dailyEmails || []).map((row) => ({
          date: row.sent_date,
          lead_reach: number(row.sent_count || 0),
          stock_reach: Math.max(0, Math.round(number(row.sent_count || 0) * 0.35)),
        })),
        leadReachedThisMonth: (demo.dailyEmails || []).reduce(
          (sumValue, row) => sumValue + number(row.sent_count || 0),
          0
        ),
        stockReachedThisMonth: sentThisMonth,
        leadCountriesReached: new Set(
          (demo.leads || []).map((row) => text(row.country)).filter(Boolean)
        ).size,
        stockCountriesReached: demo.countryEmails.filter((row) => number(row.emails_sent) > 0)
          .length,
        leadEmailsThisMonth: (demo.dailyEmails || []).reduce(
          (sumValue, row) => sumValue + number(row.sent_count || 0),
          0
        ),
        stockEmailsThisMonth: sentThisMonth,
      },
    };
  }

  const [
    snapshots,
    allItemsRaw,
    campaigns,
    messages,
    matches,
    leadCountries,
    dashboardSummaries,
    dashboardProductRows,
  ] = await Promise.all([
    fetchPaged("stock_inventory_snapshots", "*", (query) =>
      query.order("effective_date", { ascending: true })
    ),
    fetchPaged("stock_items", "*", (query) =>
      query.order("estimated_area_m2", { ascending: false })
    ),
    fetchPaged("email_campaigns", "*", (query) => query.order("created_at", { ascending: false })),
    fetchPaged("email_messages", "*", (query) => query.order("sent_at", { ascending: true })),
    fetchPaged("stock_campaign_matches", "*", (query) =>
      query.order("updated_at", { ascending: false })
    ),
    getAuthorizedLeadRows({ adminAll: true }),
    fetchPagedOptional("stock_dashboard_summaries", "*", (query) =>
      query.order("effective_date", { ascending: true })
    ),
    fetchPagedOptional("stock_dashboard_product_summary", "*", (query) =>
      query.order("area_m2", { ascending: false })
    ),
  ]);

  const allItems = allItemsRaw || [];

  const sortedSnapshots = [...snapshots].sort(
    (a, b) => toTimestamp(snapshotTimestamp(a)) - toTimestamp(snapshotTimestamp(b))
  );

  const activeSnapshot =
    sortedSnapshots.find((row) => row?.is_active === true) ||
    sortedSnapshots[sortedSnapshots.length - 1] ||
    null;

  const activeId = snapshotIdentity(activeSnapshot);
  const matchingItems = activeId
    ? allItems.filter((row) => text(row?.inventory_snapshot_id) === activeId)
    : [];
  const operationalItems = activeSnapshot ? matchingItems : allItems;
  const operationalPromotionalItems = operationalItems.filter(isPromotionalStock);
  const operationalCurrent = normalizeCurrentSnapshot(
    activeSnapshot,
    operationalItems,
    operationalPromotionalItems
  );

  const sortedDashboardSummaries = [...dashboardSummaries].sort(
    (a, b) => toTimestamp(a?.effective_date) - toTimestamp(b?.effective_date)
  );
  const latestDashboardSummary =
    sortedDashboardSummaries[sortedDashboardSummaries.length - 1] || null;
  const useDashboardSummary = Boolean(
    latestDashboardSummary &&
      (!operationalCurrent?.effective_date ||
        toTimestamp(latestDashboardSummary.effective_date) >=
          toTimestamp(operationalCurrent.effective_date))
  );

  const currentSummaryId = text(latestDashboardSummary?.summary_id);
  const currentDashboardProducts = useDashboardSummary
    ? dashboardProductRows.filter((row) => text(row?.summary_id) === currentSummaryId)
    : [];
  const summaryProductMix = currentDashboardProducts.map((row) => ({
    label: text(row?.product_group) || "Other",
    value: number(row?.area_m2),
    count: number(row?.model_count),
  }));

  const current = useDashboardSummary
    ? {
        inventory_snapshot_id: `dashboard:${currentSummaryId}`,
        summary_id: currentSummaryId,
        source_file: text(latestDashboardSummary.source_note) || "Manual stock summary",
        effective_date: latestDashboardSummary.effective_date,
        row_count: number(latestDashboardSummary.total_models),
        total_area_m2: number(latestDashboardSummary.total_area_m2),
        promotional_item_count: latestDashboardSummary.all_models_above_minimum
          ? number(latestDashboardSummary.total_models)
          : 0,
        promotional_area_m2: latestDashboardSummary.all_models_above_minimum
          ? number(latestDashboardSummary.total_area_m2)
          : 0,
        threshold_area_m2: number(latestDashboardSummary.minimum_model_area_m2),
        all_models_above_minimum: Boolean(latestDashboardSummary.all_models_above_minimum),
        summary_only: true,
        is_active: true,
      }
    : operationalCurrent;

  const previousCandidates = sortedSnapshots.filter((row) => {
    if (!activeSnapshot) return false;
    if (snapshotIdentity(row) && snapshotIdentity(row) === activeId) return false;
    return toTimestamp(snapshotTimestamp(row)) < toTimestamp(snapshotTimestamp(activeSnapshot));
  });
  const previousOperational = previousCandidates[previousCandidates.length - 1] || null;
  const previous = useDashboardSummary ? operationalCurrent : previousOperational;

  const items = useDashboardSummary ? [] : operationalItems;
  const promotionalItems = useDashboardSummary ? [] : operationalPromotionalItems;
  // Read-only price-list fallback: use the already-loaded operational inventory.
  // This keeps the client price list visible if its separate Supabase read is
  // temporarily unavailable, without writing or mutating stock data.
  const priceListItems = buildClientPriceListItems(operationalItems);
  const priceListSourceDate =
    operationalCurrent?.effective_date || snapshotTimestamp(activeSnapshot) || null;
  const priceListReferenceOnly = Boolean(
    useDashboardSummary &&
      priceListSourceDate &&
      current?.effective_date &&
      toTimestamp(current.effective_date) > toTimestamp(priceListSourceDate)
  );

  const emailAnalytics = buildStockEmailAnalytics(messages, campaigns, matches, leadCountries);
  const campaignReach = buildCampaignReachAnalytics(messages, campaigns, matches, leadCountries);
  const productMix = useDashboardSummary
    ? summaryProductMix
    : groupSum(items, "product_type", "estimated_area_m2");
  const promoMix = useDashboardSummary
    ? summaryProductMix
    : groupSum(promotionalItems, "product_type", "estimated_area_m2");
  const summaryAnalytics = useDashboardSummary
    ? buildSummaryStockAnalytics(summaryProductMix, operationalItems, matches, allItems)
    : buildSummaryStockAnalytics(
        familyMixFromItems(items),
        previousOperational
          ? allItems.filter(
              (row) => text(row?.inventory_snapshot_id) === snapshotIdentity(previousOperational)
            )
          : [],
        matches,
        allItems
      );

  return {
    preview: false,
    current,
    snapshots: useDashboardSummary ? [...sortedSnapshots, current] : sortedSnapshots,
    items,
    promotionalItems,
    productMix,
    promoMix,
    summaryOnly: useDashboardSummary,
    operationalSnapshot: operationalCurrent,
    operationalDetailStale: useDashboardSummary,
    countryEmails: emailAnalytics.countryEmails,
    dailyEmails: emailAnalytics.dailyEmails,
    actionQueue: useDashboardSummary
      ? summaryAnalytics.movement.map((row) => ({
          product_group: row.product_group,
          stock_area_m2: row.area_m2,
          stock_items: row.models,
          emails_sent: row.emails_sent,
          interested: row.interested,
          quoted: row.quoted,
          sold: row.sold,
          share_pct: row.share_pct,
          avg_area_per_model: row.avg_area_per_model,
          priority_score: row.priority_score,
        }))
      : buildStockActionQueue(promotionalItems, matches, allItems),
    productMovement: summaryAnalytics.movement,
    stockAnalytics: {
      largestFamily: summaryAnalytics.largestFamily,
      averageAreaPerModel: summaryAnalytics.averageAreaPerModel,
    },
    funnel: buildStockFunnel(matches, emailAnalytics.sentThisMonth),
    comparison: buildComparison(current, previous),
    priceConfirmed: items.filter((row) => lower(row?.price_status) === "confirmed").length,
    sentThisMonth: emailAnalytics.sentThisMonth,
    countriesReached: emailAnalytics.countriesReached,
    lastEmailAt: emailAnalytics.lastEmailAt,
    priceListItems,
    priceListSourceDate,
    priceListReferenceOnly,
    campaignReach,
  };
}

export async function getLeadSummary() {
  if (demoMode) {
    const demo = await loadDemo();
    const rows = demo.leads;
    const quality = summarizeLeadQuality(rows);
    return {
      total: rows.length,
      available: rows.filter((row) => lower(row.lead_status) === "available").length,
      claimed: rows.filter((row) => lower(row.lead_status) === "claimed").length,
      verifiedEmails: rows.filter((row) => row.email_verified || text(row.email)).length,
      geocoded: rows.filter((row) => row.latitude != null && row.longitude != null).length,
      countries: new Set(rows.map((row) => text(row.country)).filter(Boolean)).size,
      ...quality,
      qualityHistory: leadQualityHistory(rows),
    };
  }

  const profile = await getCurrentProfile();
  const rows = await getAuthorizedLeadRows({ adminAll: isBiAdminProfile(profile) });
  const quality = summarizeLeadQuality(rows);
  const restrictedPool = !isBiAdminProfile(profile);

  return {
    total: rows.length,
    available: rows.filter((row) => row._restricted_pool || lower(row.lead_status) === "available")
      .length,
    claimed: restrictedPool ? 0 : rows.filter((row) => lower(row.lead_status) === "claimed").length,
    verifiedEmails: rows.filter((row) => row.email_verified || text(row.email)).length,
    geocoded: rows.filter((row) => row.latitude != null && row.longitude != null).length,
    countries: new Set(rows.map((row) => text(row.country)).filter(Boolean)).size,
    ...quality,
    qualityHistory: leadQualityHistory(rows),
  };
}

export async function getDashboardData() {
  const [stock, leads, dataQuality] = await Promise.all([
    getStockIntelligence(),
    getLeadSummary(),
    getDataQuality(),
  ]);
  return { stock, leads, dataQuality, outreach: stock.campaignReach || null };
}

export async function getReportingData() {
  const [dashboard, campaigns] = await Promise.all([getDashboardData(), getCampaignWorkspace()]);
  return { ...dashboard, campaignDaily: campaigns?.reach?.daily || [] };
}

export async function getLeads({ mine = false } = {}) {
  if (demoMode) {
    const demo = await loadDemo();
    return mine
      ? demo.leads.filter((row) => row.assigned_to_email === "admin@platform-demo.local")
      : demo.leads;
  }

  const rows = await getAuthorizedLeadRows({ mine, adminAll: false });
  return [...rows].sort((a, b) => {
    const scoreDiff = number(b?.b2b_score) - number(a?.b2b_score);
    return scoreDiff || text(a?.name).localeCompare(text(b?.name));
  });
}

export async function claimLead(leadId) {
  if (demoMode) return { success: true, message: "Lead claimed in preview mode." };

  const result = await supabase.rpc("claim_lead_for_current_user", {
    p_lead_id: leadId,
  });

  return throwIfError(result, "Claiming lead");
}

export async function releaseLead(leadId) {
  if (demoMode) return { success: true, message: "Lead released in preview mode." };

  const result = await supabase.rpc("release_lead_for_current_user", {
    p_lead_id: leadId,
  });

  return throwIfError(result, "Releasing lead");
}

export async function getLeadWorkspace(leadId) {
  if (demoMode) {
    const demo = await loadDemo();
    return {
      notes: demo.notes.filter((row) => row.lead_id === leadId),
      followups: demo.followups.filter((row) => row.lead_id === leadId),
    };
  }

  const [notes, followups] = await Promise.all([
    fetchPaged("lead_notes", "*", (query) =>
      query.eq("lead_id", leadId).order("created_at", { ascending: false })
    ),
    fetchPaged("lead_followups", "*", (query) =>
      query.eq("lead_id", leadId).order("due_at", { ascending: true })
    ),
  ]);

  return { notes, followups };
}

export async function addLeadNote(leadId, body) {
  if (demoMode) {
    return {
      note_id: `demo-${Date.now()}`,
      lead_id: leadId,
      body,
      created_at: new Date().toISOString(),
    };
  }

  const result = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, body })
    .select("*")
    .single();

  return throwIfError(result, "Adding lead note");
}

export async function addFollowup(leadId, dueAt, title) {
  if (demoMode) {
    return {
      followup_id: `demo-${Date.now()}`,
      lead_id: leadId,
      due_at: dueAt,
      title,
      status: "open",
    };
  }

  const result = await supabase
    .from("lead_followups")
    .insert({ lead_id: leadId, due_at: dueAt, title })
    .select("*")
    .single();

  return throwIfError(result, "Creating follow-up");
}

export async function getFollowups() {
  if (demoMode) return (await loadDemo()).followups;

  return fetchPaged("lead_followups", "*,leads(name,country,email)", (query) =>
    query.order("due_at", { ascending: true })
  );
}

export async function completeFollowup(followupId) {
  if (demoMode) return;

  const result = await supabase
    .from("lead_followups")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("followup_id", followupId);

  throwIfError(result, "Completing follow-up");
}

export async function updateStockItem(itemId, patch) {
  if (demoMode) return { item_id: itemId, ...patch };

  const result = await supabase
    .from("stock_items")
    .update(patch)
    .eq("item_id", itemId)
    .select("*")
    .single();

  return throwIfError(result, "Updating stock item");
}

export async function importStockInventory({
  fileName,
  sha256,
  effectiveDate,
  sheetName,
  rows,
  confirmLargeChange = false,
}) {
  if (demoMode) {
    return {
      success: true,
      inventory_snapshot_id: `demo-${Date.now()}`,
      row_count: rows?.length || 0,
      message: "Preview mode validated the stock upload without changing data.",
    };
  }

  const result = await supabase.rpc("import_stock_inventory_snapshot", {
    p_source_file: fileName,
    p_source_sha256: sha256,
    p_effective_date: effectiveDate,
    p_source_sheet: sheetName || "Stock Upload",
    p_rows: rows || [],
    p_confirm_large_change: Boolean(confirmLargeChange),
  });
  return throwIfError(result, "Importing stock inventory");
}

export async function getStockImportHistory(limit = 8) {
  if (demoMode) return [];
  const result = await supabase
    .from("stock_inventory_uploads")
    .select(
      "upload_id,inventory_snapshot_id,source_file,source_sheet,effective_date,row_count,total_area_m2,promotional_item_count,promotional_area_m2,uploaded_by_email,uploaded_at,warning"
    )
    .order("uploaded_at", { ascending: false })
    .limit(Math.max(1, Math.min(25, Number(limit) || 8)));
  return throwIfError(result, "Loading stock upload history");
}

export async function captureStockSnapshot() {
  if (demoMode) return { success: true, message: "Preview snapshot captured." };

  throw new Error(
    "Monthly snapshot capture is not installed in this Supabase project yet. " +
      "The live dashboard uses stock_inventory_snapshots instead."
  );
}

export async function getCampaigns() {
  if (demoMode) {
    const demo = await loadDemo();
    return {
      countryEmails: demo.countryEmails,
      dailyEmails: demo.dailyEmails,
      funnel: { sent: 28, interested: 5, quoted: 2, sold: 0 },
    };
  }

  const stock = await getStockIntelligence();
  return {
    countryEmails: stock.countryEmails,
    dailyEmails: stock.dailyEmails,
    funnel: stock.funnel,
  };
}

export async function getCampaignWorkspace() {
  if (demoMode) {
    const demo = await loadDemo();
    return {
      controls: [
        {
          control_key: "lead_outreach",
          display_name: "Lead outreach",
          sender_email: "outreach@example.com",
          enabled: true,
          start_date: null,
          end_date: null,
          target_countries: [],
          priority_countries: [],
        },
        {
          control_key: "stock_promotion",
          display_name: "Stock promotion",
          sender_email: "stock@example.com",
          enabled: true,
          start_date: null,
          end_date: null,
          target_countries: [],
          priority_countries: [],
        },
      ],
      countries: [
        ...new Set((demo.leads || []).map((row) => text(row.country)).filter(Boolean)),
      ].sort(),
      analytics: {
        lead_outreach: {
          sentThisMonth: 28,
          uniqueReachedThisMonth: 28,
          countriesReachedThisMonth: 6,
          failedThisMonth: 0,
          latestSend: null,
        },
        stock_promotion: {
          sentThisMonth: 12,
          uniqueReachedThisMonth: 11,
          countriesReachedThisMonth: 6,
          failedThisMonth: 0,
          latestSend: null,
        },
      },
      reach: {
        daily: (demo.dailyEmails || []).map((row) => ({
          date: row.sent_date,
          lead_reach: number(row.sent_count),
          stock_reach: Math.round(number(row.sent_count) * 0.35),
        })),
      },
      manualCandidates: (demo.leads || []).slice(0, 50).map((row) => ({
        lead_id: row.lead_id,
        name: row.name,
        country: row.country,
        city: row.city,
        email: row.email,
        contact_full_name: row.contact_full_name,
        contact_job_title: row.contact_job_title,
        b2b_score: row.b2b_score,
      })),
      manualPriorityCountries: [],
      manualQueue: [],
    };
  }

  const [controls, campaigns, messages, matches, leads, manualQueue] = await Promise.all([
    fetchPaged("campaign_controls", "*", (query) =>
      query.order("control_key", { ascending: true })
    ),
    fetchPaged("email_campaigns", "*", (query) => query.order("created_at", { ascending: false })),
    fetchPaged("email_messages", "*", (query) => query.order("sent_at", { ascending: true })),
    fetchPaged("stock_campaign_matches", "*", (query) =>
      query.order("updated_at", { ascending: false })
    ),
    getAuthorizedLeadRows({ adminAll: true }),
    fetchPagedOptional(
      "manual_promotion_queue",
      "*",
      (query) => query.order("requested_at", { ascending: false }).limit(50),
      50
    ),
  ]);

  const stockIds = stockCampaignIds(campaigns, matches);
  const countryByLead = leadCountryMap(leads);
  const reach = buildCampaignReachAnalytics(messages, campaigns, matches, leads);
  const leadControl = controls.find((row) => row?.control_key === "lead_outreach") || {};
  const manualPriorityCountries = (leadControl.priority_countries || [])
    .map((value) => text(value))
    .filter(Boolean);
  const manualPriorityRank = new Map(
    manualPriorityCountries.map((country, index) => [lower(country), index])
  );

  const manualLeadCandidates = leads
    .filter((row) => !Boolean(row?.do_not_contact))
    .filter((row) => !text(row?.last_reply_at))
    .filter(
      (row) =>
        !["bounced", "hard_bounce", "invalid", "undeliverable"].includes(
          lower(row?.email_bounce_status)
        )
    )
    .filter(hasNamedDecisionMaker)
    .filter(hasDecisionMakerContactRoute)
    .sort((a, b) => {
      const fallbackRank = manualPriorityCountries.length + 1;
      const rankA = manualPriorityRank.has(lower(a?.country))
        ? manualPriorityRank.get(lower(a?.country))
        : fallbackRank;
      const rankB = manualPriorityRank.has(lower(b?.country))
        ? manualPriorityRank.get(lower(b?.country))
        : fallbackRank;
      return (
        rankA - rankB ||
        number(b?.b2b_score) - number(a?.b2b_score) ||
        text(a?.name).localeCompare(text(b?.name))
      );
    });

  const manualStockCandidates = leads
    .filter((row) => !Boolean(row?.do_not_contact))
    .filter((row) => !text(row?.last_reply_at))
    .filter(
      (row) =>
        !["bounced", "hard_bounce", "invalid", "undeliverable"].includes(
          lower(row?.email_bounce_status)
        )
    )
    .filter((row) => Boolean(manualPreferredEmail(row)))
    .filter(isLikelyStockBuyer)
    .sort((a, b) => {
      const readyA = lower(a?.procurement_route) === "ready_stock_low_moq" ? 0 : 1;
      const readyB = lower(b?.procurement_route) === "ready_stock_low_moq" ? 0 : 1;
      const dmA = hasNamedDecisionMaker(a) ? 0 : 1;
      const dmB = hasNamedDecisionMaker(b) ? 0 : 1;
      return (
        readyA - readyB ||
        dmA - dmB ||
        number(b?.b2b_score) - number(a?.b2b_score) ||
        text(a?.name).localeCompare(text(b?.name))
      );
    });
  const leadById = new Map(leads.map((row) => [text(row?.lead_id), row]));
  const queueWithLead = (manualQueue || []).map((row) => ({
    ...row,
    lead: leadById.get(text(row?.lead_id)) || null,
  }));

  return {
    controls,
    countries: [...new Set(leads.map((row) => text(row.country)).filter(Boolean))].sort(),
    analytics: {
      lead_outreach: campaignStats(messages, stockIds, countryByLead, "lead"),
      stock_promotion: campaignStats(messages, stockIds, countryByLead, "stock"),
    },
    reach,
    manualPriorityCountries,
    manualCandidates: manualLeadCandidates,
    manualLeadCandidates,
    manualStockCandidates,
    manualQueue: queueWithLead,
  };
}

export async function saveCampaignControl(controlKey, patch) {
  if (demoMode) return { control_key: controlKey, ...patch, updated_at: new Date().toISOString() };
  const profile = await getCurrentProfile();
  const safeCountries = [
    ...new Set((patch.target_countries || []).map((value) => text(value)).filter(Boolean)),
  ].sort();
  const priorityCountries = [
    ...new Set((patch.priority_countries || []).map((value) => text(value)).filter(Boolean)),
  ];
  const payload = {
    enabled: Boolean(patch.enabled),
    start_date: patch.start_date || null,
    end_date: patch.end_date || null,
    target_countries: safeCountries,
    priority_countries: priorityCountries,
    updated_by: profile?.id || null,
    updated_at: new Date().toISOString(),
  };
  const result = await supabase
    .from("campaign_controls")
    .update(payload)
    .eq("control_key", controlKey)
    .select("*")
    .single();
  return throwIfError(result, "Saving campaign control");
}

export async function queueManualStockPromotion(leadId, forceLocalWindow = false) {
  if (demoMode) {
    return { success: true, lead_id: leadId, status: "queued", already_queued: false };
  }
  const result = await supabase.rpc("enqueue_manual_stock_promotion", {
    p_lead_id: leadId,
    p_force_local_window: Boolean(forceLocalWindow),
  });
  return throwIfError(result, "Queueing manual stock promotion");
}

export async function cancelManualStockPromotion(queueId) {
  if (demoMode) return { success: true, cancelled: true };
  const result = await supabase.rpc("cancel_manual_stock_promotion", { p_queue_id: queueId });
  return throwIfError(result, "Cancelling manual stock promotion");
}

export async function queueManualLeadOutreach(leadId, forceLocalWindow = false) {
  if (demoMode) {
    return { success: true, lead_id: leadId, status: "queued", already_queued: false };
  }
  const result = await supabase.rpc("enqueue_manual_lead_outreach", {
    p_lead_id: leadId,
    p_force_local_window: Boolean(forceLocalWindow),
  });
  return throwIfError(result, "Queueing manual lead outreach");
}

export async function cancelManualLeadOutreach(queueId) {
  if (demoMode) return { success: true, cancelled: true };
  const result = await supabase.rpc("cancel_manual_lead_outreach", { p_queue_id: queueId });
  return throwIfError(result, "Cancelling manual lead outreach");
}

export async function setManualQueueTimingOverride(queueId, forceLocalWindow) {
  if (demoMode) {
    return {
      success: true,
      queue_id: queueId,
      force_local_window: Boolean(forceLocalWindow),
    };
  }
  const result = await supabase.rpc("set_manual_queue_timing_override", {
    p_queue_id: queueId,
    p_force_local_window: Boolean(forceLocalWindow),
  });
  return throwIfError(result, "Updating manual queue timing override");
}

export async function getGisLeads() {
  if (demoMode) return (await loadDemo()).leads;

  // Preferred path: the role-scoped GIS RPC keeps the payload small.  Some older
  // Supabase deployments may not have that RPC yet, so GIS must not white-screen
  // just because the helper function is missing or temporarily unavailable.
  try {
    return await fetchRpcPaged("platform_visible_gis_leads");
  } catch (error) {
    console.warn(
      "platform_visible_gis_leads unavailable; using the role-scoped lead pool fallback.",
      error
    );
    const rows = await getAuthorizedLeadRows({ adminAll: true });
    return rows
      .filter((row) => {
        const latitude = Number(row?.latitude);
        const longitude = Number(row?.longitude);
        return (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      })
      .map((row) => ({
        lead_id: row?.lead_id,
        name: row?.name,
        country: row?.country,
        state: row?.state,
        city: row?.city,
        latitude: Number(row?.latitude),
        longitude: Number(row?.longitude),
        b2b_score: number(row?.b2b_score),
        lead_status: row?.lead_status || "available",
        website: row?.website || "",
        email: row?.email || "",
      }));
  }
}

export async function getDataQuality() {
  const summarize = (rawRows) => {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const total = rows.length;
    const percentOfTotal = (count) => (total ? (Number(count || 0) / total) * 100 : 0);

    const hasEmail = (row) => Boolean(text(row?.email));
    const verifiedEmail = (row) =>
      hasEmail(row) &&
      (Boolean(row?.email_verified) ||
        lower(row?.email_verification_status) === "valid" ||
        lower(row?.email_verification_status) === "verified" ||
        lower(row?.email_confidence) === "high");
    const hasContact = (row) =>
      Boolean(text(row?.contact_full_name || row?.contact_name || row?.contact_person));
    const hasPhone = (row) =>
      Boolean(text(row?.direct_phone || row?.mobile_phone || row?.whatsapp_phone || row?.phone));
    const hasWebsite = (row) => Boolean(text(row?.website));
    const hasCompanyDomain = (row) => Boolean(text(row?.company_domain));
    const hasCity = (row) => Boolean(text(row?.city));
    const hasCoordinates = (row) => {
      const latitude = Number(row?.latitude);
      const longitude = Number(row?.longitude);
      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      );
    };
    const isSuppressed = (row) =>
      Boolean(row?.do_not_contact) ||
      /(bounce|invalid|undeliverable|suppressed)/.test(lower(row?.email_bounce_status));
    const isTargetFit = (row) => {
      const signal = lower(
        [row?.pvc_fit_status, row?.gold_split_status, row?.procurement_route, row?.account_tier]
          .map((value) => text(value))
          .filter(Boolean)
          .join(" ")
      );
      return !/(not_target|not target|unqualified|hold_unqualified|weak_fit|weak fit|irrelevant|consumer_only|consumer only)/.test(
        signal
      );
    };
    const hasDirectChannel = (row) => verifiedEmail(row) || hasPhone(row);
    const salesReady = (row) =>
      isTargetFit(row) && !isSuppressed(row) && hasContact(row) && hasDirectChannel(row);
    const emailReady = (row) =>
      isTargetFit(row) && !isSuppressed(row) && hasContact(row) && verifiedEmail(row);

    const humanReplyCategories = new Set([
      "positive_reply",
      "negative_reply",
      "reply_received",
      "opt_out",
    ]);
    const qualifiedReplyCategories = new Set([
      "positive_reply",
      "qualified",
      "commercial_interest",
      "buyer_interest",
    ]);
    const contacted = (row) =>
      Boolean(text(row?.last_contacted_at)) ||
      Boolean(text(row?.first_contacted_at)) ||
      !["", "not_contacted", "new", "uncontacted"].includes(lower(row?.ai_outreach_status)) ||
      Boolean(text(row?.last_reply_at)) ||
      Boolean(text(row?.reply_category));
    const replied = (row) =>
      Boolean(text(row?.last_reply_at)) || humanReplyCategories.has(lower(row?.reply_category));
    const qualified = (row) =>
      qualifiedReplyCategories.has(lower(row?.reply_category)) ||
      lower(row?.ai_outreach_status) === "qualified";

    const exactIdentityCounts = new Map();
    const companyCounts = new Map();
    const countryCounts = new Map();

    rows.forEach((row) => {
      const domain = lower(row?.company_domain);
      const companyName = lower(row?.name);
      const email = lower(row?.email);
      const city = lower(row?.city);
      const companyKey = domain || companyName || text(row?.lead_id);

      if ((domain || companyName) && email) {
        const exactKey = `${domain || companyName}|${email}|${city}`;
        exactIdentityCounts.set(exactKey, (exactIdentityCounts.get(exactKey) || 0) + 1);
      }
      if (companyKey) companyCounts.set(companyKey, (companyCounts.get(companyKey) || 0) + 1);

      const country = text(row?.country) || "Unknown";
      if (!countryCounts.has(country)) {
        countryCounts.set(country, {
          country,
          total: 0,
          target_fit: 0,
          sales_ready: 0,
          decision_maker_gap: 0,
          channel_gap: 0,
        });
      }
      const market = countryCounts.get(country);
      market.total += 1;
      if (isTargetFit(row) && !isSuppressed(row)) {
        market.target_fit += 1;
        if (salesReady(row)) market.sales_ready += 1;
        if (!hasContact(row)) market.decision_maker_gap += 1;
        else if (!hasDirectChannel(row)) market.channel_gap += 1;
      }
    });

    const duplicateGroups = [...exactIdentityCounts.values()].filter((count) => count > 1);
    const duplicateLeadRows = duplicateGroups.reduce(
      (sumValue, count) => sumValue + (count - 1),
      0
    );

    const emailCount = rows.filter(hasEmail).length;
    const verifiedEmailCount = rows.filter(verifiedEmail).length;
    const contactCount = rows.filter(hasContact).length;
    const phoneCount = rows.filter(hasPhone).length;
    const websiteCount = rows.filter(hasWebsite).length;
    const domainCount = rows.filter(hasCompanyDomain).length;
    const cityCount = rows.filter(hasCity).length;
    const coordinateCount = rows.filter(hasCoordinates).length;

    const targetFitRows = rows.filter((row) => isTargetFit(row) && !isSuppressed(row));
    const directChannelRows = targetFitRows.filter(hasDirectChannel);
    const namedWithDirectRows = targetFitRows.filter(
      (row) => hasContact(row) && hasDirectChannel(row)
    );
    const namedWithoutDirectRows = targetFitRows.filter(
      (row) => hasContact(row) && !hasDirectChannel(row)
    );
    const directWithoutNamedRows = targetFitRows.filter(
      (row) => !hasContact(row) && hasDirectChannel(row)
    );
    const neitherRows = targetFitRows.filter((row) => !hasContact(row) && !hasDirectChannel(row));
    const salesReadyRows = rows.filter(salesReady);
    const emailReadyRows = rows.filter(emailReady);

    const namedNoVerifiedEmail = targetFitRows.filter(
      (row) => hasContact(row) && !verifiedEmail(row)
    ).length;
    const namedNoDirectChannel = namedWithoutDirectRows.length;
    const noNamedDecisionMaker = targetFitRows.filter((row) => !hasContact(row)).length;
    const suppressedTarget = rows.filter((row) => isTargetFit(row) && isSuppressed(row)).length;
    const unverifiedExistingEmail = targetFitRows.filter(
      (row) => hasEmail(row) && !verifiedEmail(row)
    ).length;

    const readinessFunnel = [
      {
        key: "portfolio",
        label: "All lead records",
        count: total,
        detail: "Current portfolio before commercial eligibility checks.",
      },
      {
        key: "target_fit",
        label: "Commercially eligible / target-fit",
        count: targetFitRows.length,
        detail: "Excludes explicit not-target, unqualified and suppressed records.",
      },
      {
        key: "direct_channel",
        label: "Direct contact channel available",
        count: directChannelRows.length,
        detail: "Verified/high-confidence work email or usable phone route.",
      },
      {
        key: "named_direct",
        label: "Named decision maker + direct channel",
        count: namedWithDirectRows.length,
        detail: "The overlap that matters for high-quality manual or automated outreach.",
      },
      {
        key: "verified_email_ready",
        label: "Verified email + named decision maker",
        count: emailReadyRows.length,
        detail: "Highest-confidence email-ready segment.",
      },
    ];

    const readinessBlockers = [
      {
        key: "decision_maker",
        label: "No named decision maker",
        count: noNamedDecisionMaker,
        action: "Prioritize buyer, purchasing, sourcing, owner or category-contact research.",
      },
      {
        key: "verified_email",
        label: "Named contact lacks a verified work email",
        count: namedNoVerifiedEmail,
        action: "Verify or enrich the named contact before scaling email outreach.",
      },
      {
        key: "direct_channel",
        label: "Named contact has no direct channel",
        count: namedNoDirectChannel,
        action: "Add a verified work email, direct/mobile phone or another direct route.",
      },
      {
        key: "existing_email_unverified",
        label: "Existing email is unverified / low confidence",
        count: unverifiedExistingEmail,
        action: "Verify first; do not treat mere email presence as sales readiness.",
      },
      {
        key: "suppressed",
        label: "Target-fit records are suppressed",
        count: suppressedTarget,
        action: "Keep bounce, invalid and do-not-contact records out of active outreach.",
      },
    ]
      .map((row) => ({
        ...row,
        share_pct: targetFitRows.length ? (row.count / targetFitRows.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const matrixTotal = targetFitRows.length;
    const contactabilityMatrix = {
      named_with_direct: namedWithDirectRows.length,
      named_with_direct_pct: matrixTotal ? (namedWithDirectRows.length / matrixTotal) * 100 : 0,
      named_without_direct: namedWithoutDirectRows.length,
      named_without_direct_pct: matrixTotal
        ? (namedWithoutDirectRows.length / matrixTotal) * 100
        : 0,
      direct_without_named: directWithoutNamedRows.length,
      direct_without_named_pct: matrixTotal
        ? (directWithoutNamedRows.length / matrixTotal) * 100
        : 0,
      neither: neitherRows.length,
      neither_pct: matrixTotal ? (neitherRows.length / matrixTotal) * 100 : 0,
    };

    const scoreBands = [
      { label: "0–19", min: -Infinity, max: 19 },
      { label: "20–39", min: 20, max: 39 },
      { label: "40–59", min: 40, max: 59 },
      { label: "60–74", min: 60, max: 74 },
      { label: "75+", min: 75, max: Infinity },
    ];

    const scoreEffectiveness = scoreBands.map((band) => {
      const bandRows = rows.filter((row) => {
        const value = Number(row?.b2b_score);
        return Number.isFinite(value) && value >= band.min && value <= band.max;
      });
      const contactedRows = bandRows.filter(contacted);
      const repliedRows = contactedRows.filter(replied);
      const qualifiedRows = contactedRows.filter(qualified);
      return {
        label: band.label,
        leads: bandRows.length,
        contacted: contactedRows.length,
        replied: repliedRows.length,
        qualified: qualifiedRows.length,
        reply_rate_pct: contactedRows.length
          ? (repliedRows.length / contactedRows.length) * 100
          : 0,
        qualified_rate_pct: contactedRows.length
          ? (qualifiedRows.length / contactedRows.length) * 100
          : 0,
      };
    });

    const contactedRows = rows.filter(contacted);
    const repliedRows = contactedRows.filter(replied);
    const qualifiedRows = contactedRows.filter(qualified);
    const baselineQualifiedRate = contactedRows.length
      ? (qualifiedRows.length / contactedRows.length) * 100
      : 0;

    const marketPriorities = [...countryCounts.values()]
      .map((row) => ({
        ...row,
        blocked: Math.max(0, row.target_fit - row.sales_ready),
        readiness_pct: row.target_fit ? (row.sales_ready / row.target_fit) * 100 : 0,
      }))
      .filter((row) => row.country !== "Unknown" && row.target_fit > 0)
      .sort(
        (a, b) =>
          b.blocked - a.blocked ||
          b.decision_maker_gap - a.decision_maker_gap ||
          a.country.localeCompare(b.country)
      )
      .slice(0, 12);

    // Backward-compatible metrics retained for executive summary cards and old clients.
    const fieldProfile = [
      { key: "email", label: "Company email", present: emailCount, missing: total - emailCount },
      {
        key: "verified_email",
        label: "Verified / high-confidence email",
        present: verifiedEmailCount,
        missing: total - verifiedEmailCount,
      },
      {
        key: "decision_contact",
        label: "Named decision contact",
        present: contactCount,
        missing: total - contactCount,
      },
      {
        key: "phone",
        label: "Phone / direct contact",
        present: phoneCount,
        missing: total - phoneCount,
      },
      { key: "website", label: "Website", present: websiteCount, missing: total - websiteCount },
      {
        key: "company_domain",
        label: "Company domain",
        present: domainCount,
        missing: total - domainCount,
      },
      { key: "city", label: "City", present: cityCount, missing: total - cityCount },
      {
        key: "coordinates",
        label: "GIS coordinates",
        present: coordinateCount,
        missing: total - coordinateCount,
      },
    ].map((row) => ({ ...row, coverage_pct: percentOfTotal(row.present) }));

    const scoreValues = rows
      .map((row) => Number(row?.b2b_score))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const quantile = (values, q) => {
      if (!values.length) return 0;
      if (values.length === 1) return values[0];
      const position = (values.length - 1) * q;
      const base = Math.floor(position);
      const rest = position - base;
      const next = values[Math.min(values.length - 1, base + 1)];
      return values[base] + rest * (next - values[base]);
    };
    const scoreMean = scoreValues.length
      ? scoreValues.reduce((sumValue, value) => sumValue + value, 0) / scoreValues.length
      : 0;
    const scoreVariance = scoreValues.length
      ? scoreValues.reduce((sumValue, value) => sumValue + (value - scoreMean) ** 2, 0) /
        scoreValues.length
      : 0;
    const oldScoreBands = scoreBands.map((band) => {
      const count = scoreValues.filter((value) => value >= band.min && value <= band.max).length;
      return { label: band.label, count, share_pct: percentOfTotal(count) };
    });
    const highPriority = rows.filter((row) => number(row?.b2b_score) >= 75).length;
    const distinctCompanies = companyCounts.size;
    const multiContactCompanies = [...companyCounts.values()].filter((count) => count > 1).length;

    return {
      total_leads: total,
      distinct_companies: distinctCompanies,
      countries_count: [...countryCounts.keys()].filter((value) => value !== "Unknown").length,
      multi_contact_companies: multiContactCompanies,
      avg_contacts_per_company: distinctCompanies ? total / distinctCompanies : 0,

      target_fit_leads: targetFitRows.length,
      sales_ready_leads: salesReadyRows.length,
      sales_ready_pct: percentOfTotal(salesReadyRows.length),
      target_fit_backlog: Math.max(0, targetFitRows.length - salesReadyRows.length),
      named_decision_contacts: contactCount,
      named_decision_contact_pct: percentOfTotal(contactCount),
      verified_email_ready_leads: emailReadyRows.length,
      readiness_funnel: readinessFunnel,
      readiness_blockers: readinessBlockers,
      contactability_matrix: contactabilityMatrix,
      score_effectiveness: scoreEffectiveness,
      outcome_sample_size: contactedRows.length,
      human_reply_count: repliedRows.length,
      qualified_reply_count: qualifiedRows.length,
      baseline_qualified_rate_pct: baselineQualifiedRate,
      market_enrichment_priorities: marketPriorities,

      // Compatibility fields used elsewhere in the current dashboard.
      ready_leads: namedWithDirectRows.length,
      readiness_pct: percentOfTotal(namedWithDirectRows.length),
      verified_ready_leads: emailReadyRows.length,
      verified_readiness_pct: percentOfTotal(emailReadyRows.length),
      missing_email: total - emailCount,
      missing_coordinates: total - coordinateCount,
      unverified_email: emailCount - verifiedEmailCount,
      missing_contact: total - contactCount,
      missing_phone: total - phoneCount,
      missing_website: total - websiteCount,
      missing_company_domain: total - domainCount,
      missing_city: total - cityCount,
      duplicate_domains: duplicateGroups.length,
      duplicate_leads: duplicateLeadRows,
      email_coverage_pct: percentOfTotal(emailCount),
      verified_email_coverage_pct: percentOfTotal(verifiedEmailCount),
      contact_coverage_pct: percentOfTotal(contactCount),
      phone_coverage_pct: percentOfTotal(phoneCount),
      website_coverage_pct: percentOfTotal(websiteCount),
      company_domain_coverage_pct: percentOfTotal(domainCount),
      city_coverage_pct: percentOfTotal(cityCount),
      gis_coverage_pct: percentOfTotal(coordinateCount),
      quality_dimensions: {
        completeness_pct: fieldProfile.length
          ? fieldProfile
              .filter((row) => row.key !== "verified_email")
              .reduce((sumValue, row) => sumValue + row.coverage_pct, 0) /
            fieldProfile.filter((row) => row.key !== "verified_email").length
          : 0,
        email_validity_pct: emailCount ? (verifiedEmailCount / emailCount) * 100 : 0,
        uniqueness_pct: total ? ((total - duplicateLeadRows) / total) * 100 : 100,
        contactability_pct: percentOfTotal(emailReadyRows.length),
        gis_pct: percentOfTotal(coordinateCount),
      },
      field_profile: fieldProfile,
      score_stats: {
        count: scoreValues.length,
        mean: scoreMean,
        median: quantile(scoreValues, 0.5),
        p25: quantile(scoreValues, 0.25),
        p75: quantile(scoreValues, 0.75),
        stddev: Math.sqrt(scoreVariance),
        min: scoreValues.length ? scoreValues[0] : 0,
        max: scoreValues.length ? scoreValues[scoreValues.length - 1] : 0,
      },
      score_bands: oldScoreBands,
      high_priority_leads: highPriority,
      high_priority_share_pct: percentOfTotal(highPriority),
      top_countries: marketPriorities.map((row) => ({
        country: row.country,
        count: row.total,
        share_pct: percentOfTotal(row.total),
      })),
      top5_country_share_pct: percentOfTotal(
        marketPriorities.slice(0, 5).reduce((sumValue, row) => sumValue + row.total, 0)
      ),
      freshness: {},
    };
  };

  if (demoMode) {
    const demo = await loadDemo();
    return summarize(demo.leads);
  }

  return summarize(await getAuthorizedLeadRows({ adminAll: true }));
}

export async function getActivity() {
  if (demoMode) return (await loadDemo()).activity;

  return fetchPagedOptional(
    "app_activity_log",
    "*,app_profiles(full_name,email)",
    (query) => query.order("created_at", { ascending: false }).limit(250),
    250
  );
}

export async function getProfiles() {
  if (demoMode) return (await loadDemo()).profiles;

  const profiles = await fetchPaged("app_profiles", "*");
  return profiles.sort((a, b) => {
    const roleCompare = text(a?.role).localeCompare(text(b?.role));
    return roleCompare || text(a?.email).localeCompare(text(b?.email));
  });
}

export async function updateProfile(id, patch) {
  if (demoMode) return { id, ...patch };

  const allowedPatch = {
    full_name: patch?.full_name,
    role: patch?.role,
    active: Boolean(patch?.active),
  };

  const result = await supabase
    .from("app_profiles")
    .update(allowedPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (result.error) {
    throw new Error("Profile update failed. Please try again.");
  }

  return result.data;
}

export async function getClaimHistory(limit = 500) {
  if (demoMode) return [];
  const result = await supabase.rpc("platform_claim_history", { p_limit: limit });
  if (result.error) throw new Error("Claim history is temporarily unavailable.");
  return result.data || [];
}

export async function getClaimSummary() {
  if (demoMode) return [];
  const result = await supabase.rpc("platform_claim_summary");
  if (result.error) throw new Error("Claim overview is temporarily unavailable.");
  return result.data || [];
}
