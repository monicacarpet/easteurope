/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import LinearProgress from "@mui/material/LinearProgress";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DataTable from "examples/Tables/DataTable";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import StockUploadDialog from "components/Platform/StockUploadDialog";
import useAsyncData from "hooks/useAsyncData";
import useSessionState from "hooks/useSessionState";
import { captureStockSnapshot, getStockIntelligence, updateStockItem } from "services/api";
import { getClientPriceList } from "services/clientPriceList";
import { useAuth } from "auth/AuthContext";
import { date, dateTime, downloadCsv, number, percent } from "lib/format";
import platformLogo from "assets/images/platform-logo.svg";
import { APP_NAME, COMPANY_NAME } from "config/brand";

function clientProductGroup(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("loose") || normalized === "llt") return "LLT";
  if (normalized.includes("spc") || normalized.includes("aba")) return "SPC";
  if (normalized.includes("lvt")) return "LVT";
  return String(value || "Other");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function approvedBasePriceCny(row) {
  const value = Number(row?.client_price_cny ?? row?.target_price ?? 0);
  return Number.isFinite(value) ? value : 0;
}

const PRICE_CURRENCIES = {
  CNY: { label: "RMB (CNY)", symbol: "¥" },
  USD: { label: "US dollar (USD)", symbol: "$" },
  EUR: { label: "Euro (EUR)", symbol: "€" },
};

function convertedClientPrice(row, currency, fxRates) {
  const rate = currency === "CNY" ? 1 : Number(fxRates?.[currency] || 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return approvedBasePriceCny(row) * rate;
}

function clientPriceText(row, currency, fxRates) {
  const value = convertedClientPrice(row, currency, fxRates);
  const decimals = currency === "CNY" && Number.isInteger(value) ? 0 : 2;
  const meta = PRICE_CURRENCIES[currency] || PRICE_CURRENCIES.CNY;
  return `${meta.symbol}${value.toFixed(decimals)} ${currency}/${row?.price_unit || "m²"}`;
}

function Stock() {
  const state = useAsyncData(getStockIntelligence, []);
  const priceListState = useAsyncData(getClientPriceList, []);
  const { canManageStock } = useAuth();
  const [search, setSearch] = useSessionState("platform-stock:search", "");
  const [market, setMarket] = useSessionState("platform-stock:market", "all");
  const [product, setProduct] = useSessionState("platform-stock:product", "all");
  const [promotion, setPromotion] = useSessionState("platform-stock:promotion", "all");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [priceListProduct, setPriceListProduct] = useState("all");
  const [priceListCurrency, setPriceListCurrency] = useSessionState(
    "platform-stock:price-list-currency",
    "CNY"
  );
  const [uploadOpen, setUploadOpen] = useState(false);

  const data = state.data;
  const summaryOnly = Boolean(data?.summaryOnly || data?.current?.summary_only);
  const summaryRows = (data?.productMix || []).map((row) => ({
    product_group: row.label,
    models: Number(row.count || 0),
    area_m2: Number(row.value || 0),
  }));
  const directPriceListItems = priceListState.data?.items;
  const priceListItems = Array.isArray(directPriceListItems)
    ? directPriceListItems
    : data?.priceListItems || [];
  const priceListReferenceOnly =
    priceListState.data?.referenceOnly ?? data?.priceListReferenceOnly ?? false;
  const priceListSourceDate = priceListState.data?.sourceDate ?? data?.priceListSourceDate ?? null;
  const priceListFxRates = priceListState.data?.fxRates || { CNY: 1 };
  const priceListFxRate =
    priceListCurrency === "CNY" ? 1 : Number(priceListFxRates?.[priceListCurrency] || 0);
  const priceListFxReferenceDate = priceListState.data?.fxReferenceDate || null;
  const priceListFxSource = priceListState.data?.fxSource || null;
  const usingPriceListFallback = Boolean(priceListState.error && priceListItems.length);

  useEffect(() => {
    if (
      !priceListState.loading &&
      priceListCurrency !== "CNY" &&
      !Number(priceListFxRates?.[priceListCurrency])
    ) {
      setPriceListCurrency("CNY");
    }
  }, [priceListCurrency, priceListFxRates, priceListState.loading, setPriceListCurrency]);
  const priceListProducts = useMemo(
    () =>
      [
        ...new Set(
          priceListItems.map((row) => clientProductGroup(row.product_type)).filter(Boolean)
        ),
      ].sort(),
    [priceListItems]
  );
  const filteredPriceList = useMemo(
    () =>
      priceListItems.filter(
        (row) =>
          priceListProduct === "all" || clientProductGroup(row.product_type) === priceListProduct
      ),
    [priceListItems, priceListProduct]
  );
  const products = useMemo(
    () => [...new Set((data?.items || []).map((row) => row.product_type).filter(Boolean))].sort(),
    [data]
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.items || []).filter((row) => {
      if (market !== "all" && row.stock_market !== market) return false;
      if (product !== "all" && row.product_type !== product) return false;
      const isPromo = Boolean(
        row.promotional_email_enabled ||
          row.interest_check_enabled ||
          row.availability_status === "promotional_ready"
      );
      if (promotion === "ready" && !isPromo) return false;
      if (promotion === "blocked" && isPromo) return false;
      if (
        needle &&
        ![row.sku, row.product_type, row.specification, row.public_format, row.surface_no].some(
          (value) =>
            String(value || "")
              .toLowerCase()
              .includes(needle)
        )
      )
        return false;
      return true;
    });
  }, [data, market, product, promotion, search]);

  const table = useMemo(
    () => ({
      columns: [
        { Header: "SKU / product", accessor: "product", width: "28%", align: "left" },
        { Header: "market", accessor: "market", align: "center" },
        { Header: "specification", accessor: "specification", align: "left" },
        { Header: "stock", accessor: "stock", align: "right" },
        { Header: "price", accessor: "price", align: "center" },
        { Header: "promotion", accessor: "promotion", align: "center" },
        { Header: "action", accessor: "action", align: "center" },
      ],
      rows: filtered.map((row) => {
        const ready = Boolean(
          row.promotional_email_enabled ||
            row.interest_check_enabled ||
            row.availability_status === "promotional_ready"
        );
        return {
          product: (
            <MDBox lineHeight={1}>
              <MDTypography display="block" variant="button" fontWeight="medium">
                {row.sku || "No SKU"}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {row.public_product_description || row.product_type || "—"}
              </MDTypography>
            </MDBox>
          ),
          market: (
            <MDBadge
              badgeContent={row.stock_market || "Unknown"}
              color={row.stock_market === "外销" ? "success" : "dark"}
              variant="gradient"
              size="sm"
            />
          ),
          specification: (
            <MDBox lineHeight={1}>
              <MDTypography display="block" variant="caption" color="text" fontWeight="medium">
                {row.public_format || row.specification || "—"}
              </MDTypography>
              <MDTypography variant="caption">
                {row.thickness_mm ? `${row.thickness_mm} mm` : ""}
                {row.wear_layer_mm ? ` · ${row.wear_layer_mm} mm wear layer` : ""}
              </MDTypography>
            </MDBox>
          ),
          stock: (
            <MDBox lineHeight={1} textAlign="right">
              <MDTypography display="block" variant="caption" color="text" fontWeight="medium">
                {number(row.estimated_area_m2, 2)} m²
              </MDTypography>
              <MDTypography variant="caption">{number(row.available_boxes)} boxes</MDTypography>
            </MDBox>
          ),
          price: (
            <MDBox lineHeight={1} textAlign="center">
              <MDBadge
                badgeContent={row.price_status || "not set"}
                color={row.price_status === "confirmed" ? "success" : "warning"}
                variant="gradient"
                size="sm"
              />
              <MDTypography display="block" variant="caption" mt={0.5}>
                {row.target_price
                  ? `${number(row.target_price, 2)} ${row.price_currency || ""}/${
                      row.price_unit || "m²"
                    }`
                  : "—"}
              </MDTypography>
            </MDBox>
          ),
          promotion: (
            <MDBadge
              badgeContent={ready ? "ready" : "not eligible"}
              color={ready ? "info" : "dark"}
              variant="gradient"
              size="sm"
            />
          ),
          action: (
            <MDTypography
              component="button"
              type="button"
              variant="caption"
              color="info"
              fontWeight="medium"
              onClick={() => setSelected({ ...row })}
              sx={{ border: 0, background: "transparent", cursor: "pointer" }}
            >
              {canManageStock ? "Review / edit" : "View"}
            </MDTypography>
          ),
        };
      }),
    }),
    [filtered, canManageStock]
  );

  async function saveSelected() {
    setSaving(true);
    try {
      await updateStockItem(selected.item_id, {
        price_status: selected.price_status,
        target_price: selected.target_price === "" ? null : Number(selected.target_price),
        price_currency: selected.price_currency,
        price_unit: selected.price_unit,
        incoterm: selected.incoterm,
        promotional_email_enabled: Boolean(selected.promotional_email_enabled),
        interest_check_enabled: Boolean(selected.promotional_email_enabled),
        updated_at: new Date().toISOString(),
      });
      setSelected(null);
      setMessage("Stock item updated.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function capture() {
    try {
      const result = await captureStockSnapshot();
      setMessage(result?.message || "Monthly stock snapshot captured.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function exportClientPriceList() {
    const rows = filteredPriceList.map((row) => ({
      product: clientProductGroup(row.product_type),
      sku: row.sku || "",
      description: row.public_product_description || row.product_type || "",
      format: row.public_format || row.specification || "",
      thickness_mm: row.thickness_mm ?? "",
      wear_layer_mm: row.wear_layer_mm ?? "",
      price: Number(convertedClientPrice(row, priceListCurrency, priceListFxRates).toFixed(2)),
      currency: priceListCurrency,
      unit: row.price_unit || "m²",
      approved_price_cny: approvedBasePriceCny(row),
      cny_to_selected_fx_rate: priceListFxRate,
      fx_reference_date: priceListFxReferenceDate || "",
      fx_source: priceListFxSource || "",
      incoterm: row.incoterm || "",
      availability: priceListReferenceOnly
        ? "Confirm current SKU availability"
        : row.exact_quantity_display || `${number(row.estimated_area_m2, 2)} m²`,
    }));
    downloadCsv(`Platform-client-price-list-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function printClientPriceList() {
    if (!filteredPriceList.length) {
      setMessage("No confirmed export price rows are available for this selection.");
      return;
    }

    const popup = window.open("", "_blank", "width=1180,height=820");
    if (!popup) {
      setMessage("Please allow pop-ups for this site to open the client price list.");
      return;
    }

    const currentSummary = summaryRows
      .map(
        (row) =>
          `<span><strong>${escapeHtml(clientProductGroup(row.product_group))}</strong> ${number(
            row.area_m2,
            2
          )} m² · ${number(row.models)} models</span>`
      )
      .join("");
    const rows = filteredPriceList
      .map((row) => {
        const availability = priceListReferenceOnly
          ? "Confirm"
          : escapeHtml(row.exact_quantity_display || `${number(row.estimated_area_m2, 2)} m²`);
        const price = escapeHtml(clientPriceText(row, priceListCurrency, priceListFxRates));
        const specification = [
          row.public_format || row.specification,
          row.thickness_mm ? `${row.thickness_mm} mm` : "",
          row.wear_layer_mm ? `${row.wear_layer_mm} mm wear` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return `<tr>
          <td>${escapeHtml(clientProductGroup(row.product_type))}</td>
          <td>${escapeHtml(row.sku || "—")}</td>
          <td>${escapeHtml(specification || row.public_product_description || "—")}</td>
          <td class="num">${availability}</td>
          <td class="num"><strong>${price}</strong></td>
          <td>${escapeHtml(row.incoterm || "—")}</td>
        </tr>`;
      })
      .join("");
    const referenceNotice = priceListReferenceOnly
      ? `<div class="notice"><strong>Inventory reference:</strong> the family-level stock totals are current, while SKU-level specification rows come from the last approved detailed snapshot dated ${escapeHtml(
          priceListSourceDate || "—"
        )}. Exact SKU availability must be reconfirmed before order confirmation.</div>`
      : "";
    const selectedCurrency = PRICE_CURRENCIES[priceListCurrency] || PRICE_CURRENCIES.CNY;
    const fxNotice =
      priceListCurrency === "CNY"
        ? `<div class="notice"><strong>Price basis:</strong> active Supabase stock pricing rules in RMB (CNY).</div>`
        : `<div class="notice"><strong>Price basis:</strong> active Supabase RMB stock pricing converted automatically to ${escapeHtml(
            selectedCurrency.label
          )} at CNY 1 = ${escapeHtml(priceListFxRate.toFixed(6))} ${escapeHtml(
            priceListCurrency
          )}. Reference ${escapeHtml(priceListFxReferenceDate || "—")} · ${escapeHtml(
            priceListFxSource || "Supabase stock FX rates"
          )}.</div>`;

    popup.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Platform Ready Stock Price List</title>
<style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20345b;margin:0;background:#fff;font-size:11px}.page{max-width:1100px;margin:0 auto}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #17234f;padding-bottom:12px;margin-bottom:12px}.brand{display:flex;gap:10px;align-items:center}.brand img{width:54px;height:36px;object-fit:contain}.title{font-size:20px;font-weight:700}.sub{font-size:10px;color:#7c879d;margin-top:3px}.summary{display:flex;gap:18px;flex-wrap:wrap;padding:9px 0 12px;color:#20345b}.summary span{white-space:nowrap}.notice{padding:9px 11px;background:#fff8e8;border-left:3px solid #f59e0b;margin:0 0 12px;line-height:1.45}.meta{text-align:right;color:#7c879d;font-size:9px}table{width:100%;border-collapse:collapse}th{background:#f5f7fa;color:#60708e;text-align:left;font-size:9px;letter-spacing:.04em;padding:7px;border-bottom:1px solid #dfe5ed}td{padding:7px;border-bottom:1px solid #e8ecf2;vertical-align:top}td.num{text-align:right;white-space:nowrap}.foot{margin-top:12px;color:#7c879d;font-size:9px;display:flex;justify-content:space-between;gap:20px}.printbar{display:flex;justify-content:flex-end;margin:0 0 12px}.printbar button{border:0;background:#17234f;color:#fff;border-radius:5px;padding:9px 14px;cursor:pointer}@media print{.printbar{display:none}.page{max-width:none}tr{break-inside:avoid}}
</style></head><body><div class="page">
<div class="printbar"><button onclick="window.print()">Print / Save PDF</button></div>
<div class="head"><div class="brand"><img src="${platformLogo}" alt="${escapeHtml(
      COMPANY_NAME
    )}"><div><div class="title">Ready Stock Price List</div><div class="sub">${escapeHtml(
      APP_NAME
    )} · ${escapeHtml(COMPANY_NAME)}</div></div></div><div class="meta">Generated ${escapeHtml(
      new Date().toLocaleString()
    )}<br>Current stock summary ${escapeHtml(data?.current?.effective_date || "—")}</div></div>
<div class="summary">${currentSummary}</div>${referenceNotice}${fxNotice}
<table><thead><tr><th>PRODUCT</th><th>SKU</th><th>SPECIFICATION</th><th style="text-align:right">AVAILABILITY</th><th style="text-align:right">PRICE</th><th>INCOTERM</th></tr></thead><tbody>${rows}</tbody></table>
<div class="foot"><span>Prices are subject to final commercial confirmation and applicable order terms.</span><span>${escapeHtml(
      COMPANY_NAME
    )}</span></div>
</div></body></html>`);
    popup.document.close();
    popup.focus();
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <PageState loading={state.loading} error={state.error} label="Loading current inventory…">
          {data ? (
            <>
              <SectionHeader
                title="Stock portfolio"
                subtitle="Current approved inventory, promotion eligibility, exact pricing and month-on-month stock movement."
                action={
                  <MDBox display="flex" gap={1.25} flexWrap="wrap">
                    <MDButton
                      variant="outlined"
                      color="info"
                      onClick={() => setPriceListOpen(true)}
                    >
                      <Icon
                        baseClassName="material-icons-outlined"
                        sx={{ fontSize: "17px !important" }}
                      >
                        request_quote
                      </Icon>
                      &nbsp; client price list
                    </MDButton>
                    <MDButton
                      variant="outlined"
                      color="dark"
                      onClick={() =>
                        downloadCsv(
                          summaryOnly
                            ? "platform-current-stock-summary.csv"
                            : "platform-current-stock.csv",
                          summaryOnly ? summaryRows : filtered
                        )
                      }
                    >
                      <Icon
                        baseClassName="material-icons-outlined"
                        sx={{ fontSize: "17px !important" }}
                      >
                        download
                      </Icon>
                      &nbsp; export current
                    </MDButton>
                  </MDBox>
                }
              />
              {data.preview ? (
                <Alert severity="info" sx={{ mb: 3 }}>
                  Preview mode is displaying the exact V1.7 inventory snapshot shipped with the
                  repository.
                </Alert>
              ) : null}
              {summaryOnly ? (
                <Alert severity="info" sx={{ mb: 3 }}>
                  The 8 Aug stock summary is current: 320 models / 48,607.27 m², all reported above
                  20 m². Detailed SKU, specification and price rows have not been replaced, so stale
                  Aug 3 lot detail is intentionally hidden.
                </Alert>
              ) : null}
              {message ? (
                <Alert
                  severity={message.toLowerCase().includes("error") ? "error" : "success"}
                  sx={{ mb: 3 }}
                  onClose={() => setMessage("")}
                >
                  {message}
                </Alert>
              ) : null}
              <MDBox
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0,1fr))",
                    xl: "repeat(4, minmax(0,1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {[
                  {
                    label: "Total stock",
                    value: `${number(data.current?.total_area_m2, 0)} m²`,
                    detail: `${number(data.current?.row_count || data.items.length)} ${
                      summaryOnly ? "models above 20 m²" : "lots in active snapshot"
                    }`,
                  },
                  {
                    label: summaryOnly ? "Product families" : "Promotion-ready",
                    value: summaryOnly
                      ? number(summaryRows.length)
                      : `${number(data.current?.promotional_area_m2, 0)} m²`,
                    detail: summaryOnly
                      ? "LVT · LLT · SPC"
                      : `${number(
                          data.current?.promotional_item_count || data.promotionalItems.length
                        )} eligible export lots`,
                  },
                  {
                    label: "Change vs previous",
                    value:
                      data.comparison.deltaPct == null
                        ? "No baseline"
                        : `${data.comparison.deltaPct >= 0 ? "+" : ""}${percent(
                            data.comparison.deltaPct
                          )}`,
                    detail:
                      data.comparison.deltaArea == null
                        ? "Previous approved snapshot required"
                        : `${data.comparison.deltaArea >= 0 ? "+" : ""}${number(
                            data.comparison.deltaArea,
                            0
                          )} m² · ${
                            data.comparison.previous
                              ? date(
                                  data.comparison.previous.snapshot_month ||
                                    data.comparison.previous.effective_date
                                )
                              : "previous"
                          }`,
                  },
                  {
                    label: summaryOnly ? "Detailed inventory" : "Pricing readiness",
                    value: summaryOnly
                      ? "Pending"
                      : percent(
                          data.items.length ? (data.priceConfirmed / data.items.length) * 100 : 0
                        ),
                    detail: summaryOnly
                      ? "Current SKU-level file required for live exact-lot sending"
                      : `${number(data.priceConfirmed)} lots have confirmed campaign price`,
                  },
                ].map((metric, index) => (
                  <MDBox
                    key={metric.label}
                    px={{ xs: 2, md: 2.35 }}
                    py={2.1}
                    sx={{
                      minWidth: 0,
                      backgroundColor: "#fff",
                      border: "1px solid #e3e8f0",
                      borderRadius: "12px",
                    }}
                  >
                    <MDTypography variant="caption" color="text">
                      {metric.label}
                    </MDTypography>
                    <MDTypography
                      variant="h5"
                      mt={0.45}
                      sx={{ color: "#20345b", letterSpacing: "-0.02em" }}
                    >
                      {metric.value}
                    </MDTypography>
                    <MDTypography
                      display="block"
                      variant="caption"
                      color="text"
                      mt={0.5}
                      sx={{ lineHeight: 1.45 }}
                    >
                      {metric.detail}
                    </MDTypography>
                  </MDBox>
                ))}
              </MDBox>

              <Card
                sx={{ mt: 3, borderRadius: "8px", boxShadow: "none", border: "1px solid #e3e8f0" }}
              >
                <MDBox p={{ xs: 2, md: 2.5 }}>
                  <MDTypography variant="h6">Stock analytics</MDTypography>
                  <MDTypography variant="caption" color="text">
                    Composition, movement and campaign exposure from the current stock summary and
                    recorded campaign history.
                  </MDTypography>
                  <Grid container spacing={2.5} mt={0.2}>
                    <Grid item xs={12} lg={6}>
                      <MDTypography variant="button" fontWeight="bold">
                        Product composition
                      </MDTypography>
                      <MDBox mt={1.2} display="grid" gap={1.35}>
                        {(data.productMovement || []).map((row) => (
                          <MDBox key={`mix-${row.product_group}`}>
                            <MDBox display="flex" justifyContent="space-between" gap={1}>
                              <MDTypography variant="caption" color="text" fontWeight="medium">
                                {row.product_group}
                              </MDTypography>
                              <MDTypography variant="caption" color="text">
                                {percent(row.share_pct)} · {number(row.area_m2, 2)} m²
                              </MDTypography>
                            </MDBox>
                            <LinearProgress
                              variant="determinate"
                              value={Math.max(0, Math.min(100, Number(row.share_pct || 0)))}
                              sx={{
                                mt: 0.55,
                                height: 5,
                                borderRadius: 0,
                                backgroundColor: "#eef1f5",
                                "& .MuiLinearProgress-bar": { backgroundColor: "#17234f" },
                              }}
                            />
                            <MDTypography variant="caption" color="text">
                              {number(row.models)} models · avg {number(row.avg_area_per_model, 1)}{" "}
                              m²/model
                            </MDTypography>
                          </MDBox>
                        ))}
                      </MDBox>
                    </Grid>
                    <Grid item xs={12} lg={6}>
                      <MDTypography variant="button" fontWeight="bold">
                        Movement vs previous snapshot
                      </MDTypography>
                      <MDBox mt={1.05}>
                        {(data.productMovement || []).map((row, index) => (
                          <MDBox key={`move-${row.product_group}`}>
                            {index ? <Divider sx={{ my: 0.9 }} /> : null}
                            <MDBox
                              display="flex"
                              justifyContent="space-between"
                              gap={1}
                              alignItems="center"
                            >
                              <MDBox>
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {row.product_group}
                                </MDTypography>
                                <MDTypography display="block" variant="caption" color="text">
                                  previous {number(row.previous_area_m2, 2)} m²
                                </MDTypography>
                              </MDBox>
                              <MDBox textAlign="right">
                                <MDTypography
                                  variant="caption"
                                  color={
                                    row.delta_area_m2 < 0
                                      ? "success"
                                      : row.delta_area_m2 > 0
                                      ? "warning"
                                      : "text"
                                  }
                                  fontWeight="bold"
                                >
                                  {row.delta_area_m2 >= 0 ? "+" : ""}
                                  {number(row.delta_area_m2, 2)} m²
                                </MDTypography>
                                <MDTypography display="block" variant="caption" color="text">
                                  {row.delta_pct == null
                                    ? "no comparable baseline"
                                    : `${row.delta_pct >= 0 ? "+" : ""}${percent(row.delta_pct)}`}
                                </MDTypography>
                              </MDBox>
                            </MDBox>
                          </MDBox>
                        ))}
                      </MDBox>
                    </Grid>
                    <Grid item xs={12}>
                      <MDTypography variant="button" fontWeight="bold">
                        Campaign exposure by product
                      </MDTypography>
                      <MDBox mt={1.05}>
                        {(data.productMovement || []).map((row, index) => (
                          <MDBox key={`campaign-${row.product_group}`}>
                            {index ? <Divider sx={{ my: 0.9 }} /> : null}
                            <MDBox display="flex" justifyContent="space-between" gap={1}>
                              <MDBox>
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {row.product_group}
                                </MDTypography>
                                <MDTypography display="block" variant="caption" color="text">
                                  {number(row.models)} models · {number(row.area_m2, 0)} m²
                                </MDTypography>
                              </MDBox>
                              <MDBox textAlign="right">
                                <MDTypography variant="caption" color="text" fontWeight="bold">
                                  {number(row.emails_sent)} reached
                                </MDTypography>
                                <MDTypography display="block" variant="caption" color="text">
                                  {number(row.interested)} interested · {number(row.quoted)} quoted
                                </MDTypography>
                              </MDBox>
                            </MDBox>
                          </MDBox>
                        ))}
                        <Divider sx={{ my: 1 }} />
                        <MDTypography variant="caption" color="text">
                          Overall average inventory density:{" "}
                          {number(data.stockAnalytics?.averageAreaPerModel || 0, 1)} m² per model.
                        </MDTypography>
                      </MDBox>
                    </Grid>
                  </Grid>
                </MDBox>
              </Card>

              {summaryOnly ? (
                <Card
                  sx={{
                    mt: 3,
                    borderRadius: "8px",
                    boxShadow: "none",
                    border: "1px solid #e3e8f0",
                  }}
                >
                  <MDBox px={{ xs: 2, md: 2.5 }} pt={2.2} pb={1.1}>
                    <MDTypography variant="h6">Current stock by product family</MDTypography>
                    <MDTypography variant="caption" color="text">
                      All reported models are above 20 m².
                    </MDTypography>
                  </MDBox>
                  <MDBox sx={{ borderTop: "1px solid #e3e8f0" }}>
                    <MDBox
                      px={{ xs: 2, md: 2.5 }}
                      py={1}
                      sx={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(100px,1.1fr) minmax(90px,.7fr) minmax(130px,1fr) minmax(110px,.8fr)",
                        gap: 1.5,
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      {["PRODUCT", "MODELS", "STOCK", "SHARE"].map((label) => (
                        <MDTypography key={label} variant="caption" color="text" fontWeight="bold">
                          {label}
                        </MDTypography>
                      ))}
                    </MDBox>
                    {summaryRows.map((row, index) => {
                      const share = data.current?.total_area_m2
                        ? (row.area_m2 / Number(data.current.total_area_m2)) * 100
                        : 0;
                      return (
                        <MDBox
                          key={row.product_group}
                          px={{ xs: 2, md: 2.5 }}
                          py={1.35}
                          sx={{
                            display: "grid",
                            gridTemplateColumns:
                              "minmax(100px,1.1fr) minmax(90px,.7fr) minmax(130px,1fr) minmax(110px,.8fr)",
                            gap: 1.5,
                            borderTop: index ? "1px solid #edf0f4" : 0,
                            alignItems: "center",
                          }}
                        >
                          <MDTypography
                            variant="button"
                            fontWeight="bold"
                            sx={{ color: "#20345b" }}
                          >
                            {row.product_group}
                          </MDTypography>
                          <MDTypography variant="button" color="text">
                            {number(row.models)}
                          </MDTypography>
                          <MDTypography variant="button" color="text">
                            {number(row.area_m2, 2)} m²
                          </MDTypography>
                          <MDTypography variant="button" color="text">
                            {percent(share)}
                          </MDTypography>
                        </MDBox>
                      );
                    })}
                  </MDBox>
                </Card>
              ) : (
                <Card
                  sx={{
                    mt: 3,
                    borderRadius: "8px",
                    boxShadow: "none",
                    border: "1px solid #e3e8f0",
                  }}
                >
                  <MDBox p={{ xs: 2, md: 2.5 }} pb={1}>
                    <MDBox
                      display="flex"
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", lg: "center" }}
                      flexDirection={{ xs: "column", lg: "row" }}
                      gap={2}
                    >
                      <MDBox>
                        <MDTypography variant="h6">Inventory detail</MDTypography>
                        <MDTypography variant="button" color="text">
                          {number(filtered.length)} visible lots · active snapshot{" "}
                          {data.current?.inventory_snapshot_id || "not identified"}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2,minmax(0,1fr))",
                            xl: "repeat(4,minmax(150px,1fr))",
                          },
                          gap: 1,
                          width: { xs: "100%", lg: "auto" },
                          minWidth: { lg: 650 },
                        }}
                      >
                        <MDInput
                          label="Search SKU or format"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          fullWidth
                        />
                        <Select
                          size="small"
                          value={market}
                          onChange={(event) => setMarket(event.target.value)}
                          sx={{ minWidth: 130 }}
                        >
                          <MenuItem value="all">All markets</MenuItem>
                          <MenuItem value="外销">Export</MenuItem>
                          <MenuItem value="内销">Domestic</MenuItem>
                        </Select>
                        <Select
                          size="small"
                          value={product}
                          onChange={(event) => setProduct(event.target.value)}
                          sx={{ minWidth: 170 }}
                        >
                          <MenuItem value="all">All products</MenuItem>
                          {products.map((value) => (
                            <MenuItem key={value} value={value}>
                              {value}
                            </MenuItem>
                          ))}
                        </Select>
                        <Select
                          size="small"
                          value={promotion}
                          onChange={(event) => setPromotion(event.target.value)}
                          sx={{ minWidth: 165 }}
                        >
                          <MenuItem value="all">All eligibility</MenuItem>
                          <MenuItem value="ready">Promotion-ready</MenuItem>
                          <MenuItem value="blocked">Not eligible</MenuItem>
                        </Select>
                      </MDBox>
                    </MDBox>
                  </MDBox>
                  <DataTable
                    table={table}
                    canSearch={false}
                    entriesPerPage={{ defaultValue: 25, entries: [10, 25, 50, 100] }}
                    showTotalEntries
                    stateStorageKey="platform-stock:table"
                    pagination={{ variant: "gradient", color: "info" }}
                  />
                </Card>
              )}

              {canManageStock ? (
                <Card
                  sx={{
                    mt: 4,
                    borderRadius: "14px",
                    boxShadow: "none",
                    border: "1px solid #DDE5F0",
                    overflow: "hidden",
                  }}
                >
                  <MDBox p={{ xs: 2.5, md: 3.5 }}>
                    <MDBox
                      display="flex"
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                      flexDirection={{ xs: "column", md: "row" }}
                      gap={2.5}
                      mb={2.5}
                    >
                      <MDBox>
                        <MDTypography
                          variant="h5"
                          sx={{ color: "#20345B", letterSpacing: "-0.02em" }}
                        >
                          Stock data management
                        </MDTypography>
                        <MDTypography
                          display="block"
                          variant="button"
                          color="text"
                          mt={0.65}
                          sx={{ maxWidth: 720, lineHeight: 1.55 }}
                        >
                          Replace the active inventory with one complete, validated file. Invalid
                          files are rejected and the current Supabase snapshot stays active.
                        </MDTypography>
                      </MDBox>
                      {!summaryOnly ? (
                        <MDButton
                          variant="outlined"
                          color="dark"
                          onClick={capture}
                          sx={{ flexShrink: 0 }}
                        >
                          <Icon
                            baseClassName="material-icons-outlined"
                            sx={{ fontSize: "17px !important" }}
                          >
                            photo_camera
                          </Icon>
                          &nbsp; capture monthly snapshot
                        </MDButton>
                      ) : null}
                    </MDBox>

                    <MDBox
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) auto" },
                        gap: { xs: 2.5, md: 4 },
                        alignItems: "center",
                        border: "2px dashed #C9D3E1",
                        borderRadius: "14px",
                        backgroundColor: "#FBFCFE",
                        px: { xs: 2.5, md: 4 },
                        py: { xs: 3.5, md: 4 },
                      }}
                    >
                      <MDBox display="flex" alignItems="flex-start" gap={2}>
                        <MDBox
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          sx={{
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            borderRadius: "13px",
                            color: "#377DFF",
                            backgroundColor: "#EAF2FF",
                          }}
                        >
                          <Icon
                            baseClassName="material-icons-outlined"
                            sx={{ fontSize: "27px !important" }}
                          >
                            upload_file
                          </Icon>
                        </MDBox>
                        <MDBox>
                          <MDTypography
                            variant="button"
                            fontWeight="bold"
                            sx={{ color: "#20345B" }}
                          >
                            Upload a complete stock snapshot
                          </MDTypography>
                          <MDTypography
                            display="block"
                            variant="caption"
                            color="text"
                            mt={0.55}
                            sx={{ lineHeight: 1.55 }}
                          >
                            Accepted formats: .xlsx and .csv. WPS users should save the file as
                            Excel first.
                          </MDTypography>
                          <MDTypography display="block" variant="caption" color="text" mt={0.35}>
                            Active snapshot:{" "}
                            {data.current?.inventory_snapshot_id || "not identified"} ·{" "}
                            {number(data.current?.row_count || 0)} rows
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                      <MDButton
                        variant="contained"
                        onClick={() => setUploadOpen(true)}
                        sx={{
                          color: "#fff !important",
                          backgroundColor: "#377DFF !important",
                          borderRadius: "8px",
                          px: 3.25,
                          py: 1.15,
                          minWidth: { md: 190 },
                          boxShadow: "none",
                          textTransform: "none",
                          "&:hover": { backgroundColor: "#528FFF !important", boxShadow: "none" },
                        }}
                      >
                        <Icon
                          baseClassName="material-icons-outlined"
                          sx={{ fontSize: "18px !important" }}
                        >
                          upload
                        </Icon>
                        &nbsp; Choose stock file
                      </MDButton>
                    </MDBox>
                  </MDBox>
                </Card>
              ) : null}
            </>
          ) : (
            <MDBox />
          )}
        </PageState>
      </MDBox>

      <StockUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        currentSnapshot={data?.current || null}
        onImported={async (response) => {
          setMessage(response?.message || "Stock inventory updated.");
          await Promise.all([state.refresh(), priceListState.refresh()]);
        }}
      />

      <Dialog open={priceListOpen} onClose={() => setPriceListOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Ready stock client price list</DialogTitle>
        <DialogContent>
          <MDBox pt={0.6}>
            {priceListState.error && !priceListItems.length ? (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                Client price list could not load. Please refresh and try again.
              </Alert>
            ) : null}
            {usingPriceListFallback ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Direct price-list access is temporarily unavailable. Showing the approved read-only
                price list from the inventory already loaded in this dashboard.
              </Alert>
            ) : null}
            {priceListReferenceOnly ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Current family totals are from {date(data?.current?.effective_date)}, but the latest
                SKU-level specification detail is from {date(priceListSourceDate)}. The client list
                therefore marks SKU availability as “Confirm” instead of showing stale quantities.
              </Alert>
            ) : null}
            <Alert severity="info" sx={{ mb: 2 }}>
              The approved base is the active Supabase RMB stock price. Choose RMB, USD or EUR;
              displayed prices, CSV and PDF update automatically from the validated Supabase FX rate
              {priceListCurrency === "CNY" ? "." : ` dated ${date(priceListFxReferenceDate)}.`}
            </Alert>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              flexDirection={{ xs: "column", md: "row" }}
              gap={1.5}
              mb={1.5}
            >
              <MDBox>
                <MDTypography variant="button" fontWeight="bold" sx={{ color: "#20345b" }}>
                  {number(filteredPriceList.length)} confirmed export price rows
                </MDTypography>
                <MDTypography display="block" variant="caption" color="text">
                  Current portfolio: {number(data?.current?.total_area_m2 || 0, 2)} m² ·{" "}
                  {number(data?.current?.row_count || 0)} models
                </MDTypography>
              </MDBox>
              <MDBox display="flex" gap={1} flexWrap="wrap">
                <Select
                  size="small"
                  value={priceListCurrency}
                  onChange={(event) => setPriceListCurrency(event.target.value)}
                  aria-label="Price-list currency"
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="CNY">RMB (CNY ¥)</MenuItem>
                  <MenuItem value="USD" disabled={!Number(priceListFxRates?.USD)}>
                    USD ($)
                  </MenuItem>
                  <MenuItem value="EUR" disabled={!Number(priceListFxRates?.EUR)}>
                    EUR (€)
                  </MenuItem>
                </Select>
                <Select
                  size="small"
                  value={priceListProduct}
                  onChange={(event) => setPriceListProduct(event.target.value)}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="all">All products</MenuItem>
                  {priceListProducts.map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </MDBox>
            </MDBox>
            <MDBox sx={{ border: "1px solid #e3e8f0", maxHeight: 430, overflow: "auto" }}>
              <MDBox
                px={1.5}
                py={0.9}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "90px 140px minmax(230px,1fr) 130px 150px",
                  gap: 1.2,
                  backgroundColor: "#f8fafc",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                {["PRODUCT", "SKU", "SPECIFICATION", "AVAILABILITY", "PRICE"].map((label) => (
                  <MDTypography key={label} variant="caption" color="text" fontWeight="bold">
                    {label}
                  </MDTypography>
                ))}
              </MDBox>
              {filteredPriceList.map((row, index) => (
                <MDBox
                  key={row.item_id || `${row.sku}-${index}`}
                  px={1.5}
                  py={1}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "90px 140px minmax(230px,1fr) 130px 150px",
                    gap: 1.2,
                    borderTop: index ? "1px solid #edf0f4" : 0,
                    alignItems: "center",
                  }}
                >
                  <MDTypography variant="caption" fontWeight="bold" sx={{ color: "#20345b" }}>
                    {clientProductGroup(row.product_type)}
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    {row.sku || "—"}
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    {row.public_format ||
                      row.specification ||
                      row.public_product_description ||
                      "—"}
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    {priceListReferenceOnly
                      ? "Confirm"
                      : row.exact_quantity_display || `${number(row.estimated_area_m2, 2)} m²`}
                  </MDTypography>
                  <MDTypography variant="caption" fontWeight="bold" sx={{ color: "#20345b" }}>
                    {clientPriceText(row, priceListCurrency, priceListFxRates)}
                  </MDTypography>
                </MDBox>
              ))}
              {!filteredPriceList.length ? (
                <MDBox p={3} textAlign="center">
                  <MDTypography variant="caption" color="text">
                    No confirmed export prices match this filter.
                  </MDTypography>
                </MDBox>
              ) : null}
            </MDBox>
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="text" onClick={() => setPriceListOpen(false)}>
            Close
          </MDButton>
          <MDButton
            color="dark"
            variant="outlined"
            disabled={!filteredPriceList.length}
            onClick={exportClientPriceList}
          >
            Download CSV
          </MDButton>
          <MDButton
            color="info"
            variant="gradient"
            disabled={!filteredPriceList.length}
            onClick={printClientPriceList}
          >
            Print / Save PDF
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!summaryOnly && Boolean(selected)}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{canManageStock ? "Review stock item" : "Stock item detail"}</DialogTitle>
        <DialogContent>
          {selected ? (
            <MDBox pt={1} display="grid" gap={2}>
              <MDTypography variant="button" color="text">
                {selected.sku} · {selected.public_product_description}
              </MDTypography>
              <MDInput
                label="Price status"
                value={selected.price_status || ""}
                disabled={!canManageStock}
                onChange={(event) => setSelected({ ...selected, price_status: event.target.value })}
                fullWidth
              />
              <MDInput
                label="Target price"
                type="number"
                value={selected.target_price ?? ""}
                disabled={!canManageStock}
                onChange={(event) => setSelected({ ...selected, target_price: event.target.value })}
                fullWidth
              />
              <MDInput
                label="Currency"
                value={selected.price_currency || ""}
                disabled={!canManageStock}
                onChange={(event) =>
                  setSelected({ ...selected, price_currency: event.target.value })
                }
                fullWidth
              />
              <MDInput
                label="Price unit"
                value={selected.price_unit || "m²"}
                disabled={!canManageStock}
                onChange={(event) => setSelected({ ...selected, price_unit: event.target.value })}
                fullWidth
              />
              <MDInput
                label="Incoterm"
                value={selected.incoterm || ""}
                disabled={!canManageStock}
                onChange={(event) => setSelected({ ...selected, incoterm: event.target.value })}
                fullWidth
              />
              <Alert severity={selected.promotional_email_enabled ? "success" : "info"}>
                {selected.promotion_reason || "No internal eligibility note."}
              </Alert>
              <MDTypography variant="caption" color="text">
                Last updated: {dateTime(selected.updated_at)}
              </MDTypography>
            </MDBox>
          ) : null}
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="text" onClick={() => setSelected(null)}>
            Close
          </MDButton>
          {canManageStock ? (
            <MDButton color="info" variant="gradient" disabled={saving} onClick={saveSelected}>
              {saving ? "Saving…" : "Save changes"}
            </MDButton>
          ) : null}
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default Stock;
