import { demoMode, supabase } from "lib/supabase";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function after(left, right) {
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime > rightTime;
}

export async function getClientPriceList() {
  if (demoMode) {
    return {
      items: null,
      sourceDate: null,
      referenceOnly: false,
      fxRates: { CNY: 1 },
      fxReferenceDate: null,
      fxSource: null,
    };
  }

  const itemResult = await supabase.rpc("platform_client_price_list");
  if (itemResult.error) {
    throw new Error("Client price list is temporarily unavailable.");
  }

  const items = (itemResult.data || []).map((row) => ({
    ...row,
    client_price_cny: number(row.client_price_cny ?? row.target_price),
    client_price_source: "Supabase active stock pricing rule",
  }));

  const sourceDate =
    items
      .map((row) => row.source_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

  const summaryResult = await supabase
    .from("stock_dashboard_summaries")
    .select("effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const referenceOnly = summaryResult.error
    ? false
    : after(summaryResult.data?.effective_date, sourceDate);

  const fxResult = await supabase
    .from("stock_fx_rates")
    .select("quote_currency, rate, rate_date, rate_timestamp, source")
    .eq("base_currency", "CNY")
    .in("quote_currency", ["USD", "EUR"]);

  const fxRows = fxResult.error ? [] : fxResult.data || [];
  const fxRates = { CNY: 1 };
  fxRows.forEach((row) => {
    const currency = String(row?.quote_currency || "").toUpperCase();
    const rate = number(row?.rate);
    if (["USD", "EUR"].includes(currency) && rate > 0) fxRates[currency] = rate;
  });
  const fxReferenceDate =
    fxRows
      .map((row) => row?.rate_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;
  const fxSource = fxRows.map((row) => row?.source).find(Boolean) || null;

  return {
    items,
    sourceDate,
    referenceOnly,
    snapshotId: items[0]?.inventory_snapshot_id || null,
    fxRates,
    fxReferenceDate,
    fxSource,
  };
}
