/* eslint-disable react/prop-types -- local report primitives only receive data from this module. */
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import PageState from "components/Platform/PageState";
import useAsyncData from "hooks/useAsyncData";
import { getReportingData } from "services/api";
import { number, percent } from "lib/format";
import machineLoader from "assets/images/report-machine-loader.png";
import { APP_NAME } from "config/brand";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const C = {
  navy: "#17234f",
  blue: "#2f6fe4",
  text: "#20345b",
  muted: "#7c879d",
  border: "#e2e7ef",
  grid: "#edf1f6",
  soft: "#f7f9fc",
  orange: "#f59e0b",
  coral: "#f57972",
  green: "#2e9d68",
  purple: "#8f7af5",
  gray: "#aab4c4",
};

const REPORT_PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 9mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #platform-generated-report, #platform-generated-report * { visibility: visible !important; }
  #platform-generated-report {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  .platform-no-print { display: none !important; }
  .platform-report-panel { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
  .platform-report-page-break { break-before: page; page-break-before: always; }
  canvas { max-width: 100% !important; }
}
@keyframes platformMachineFloat {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(7px, -2px, 0); }
}
@keyframes platformLoaderTravel {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(320%); }
}
`;

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return [fmt(start), fmt(end)];
}

function shortDay(value) {
  if (!value) return "";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(5);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ReportPanel({ title, subtitle, children, sx = {} }) {
  return (
    <Box
      className="platform-report-panel"
      sx={{
        border: `1px solid ${C.border}`,
        backgroundColor: "#fff",
        borderRadius: "8px",
        p: 1.65,
        minWidth: 0,
        ...sx,
      }}
    >
      <Typography sx={{ fontSize: 12.4, fontWeight: 700, color: C.text }}>{title}</Typography>
      {subtitle ? (
        <Typography sx={{ mt: 0.2, mb: 1.2, fontSize: 9.8, lineHeight: 1.35, color: C.muted }}>
          {subtitle}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}

function MetricCell({ label, value, detail, accent = C.navy }) {
  return (
    <Box
      sx={{
        px: 1.6,
        py: 1.35,
        minHeight: 82,
        borderRight: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <Typography sx={{ fontSize: 9.5, color: C.muted }}>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 19, lineHeight: 1.15, fontWeight: 700, color: C.text }}>
        {value}
      </Typography>
      <Typography sx={{ mt: 0.38, fontSize: 9.4, color: accent, lineHeight: 1.3 }}>
        {detail}
      </Typography>
    </Box>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <Box
      component="label"
      sx={{
        height: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.45,
        px: 0.4,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <Checkbox
        size="small"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Typography sx={{ fontSize: 12, color: C.text }}>{label}</Typography>
    </Box>
  );
}

function chartTooltip() {
  return {
    backgroundColor: "#fff",
    titleColor: C.text,
    bodyColor: C.muted,
    borderColor: C.border,
    borderWidth: 1,
  };
}

function LeadReachChart({ rows }) {
  const data = {
    labels: rows.map((row) => shortDay(row.date)),
    datasets: [
      {
        label: "Unique leads reached",
        data: rows.map((row) => Number(row.lead_reach || 0)),
        borderColor: C.blue,
        backgroundColor: "rgba(47, 111, 228, 0.08)",
        borderWidth: 2,
        pointRadius: 1.8,
        tension: 0.32,
        fill: true,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: chartTooltip() },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.muted, maxTicksLimit: 7, font: { size: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: C.grid },
        border: { display: false },
        ticks: { color: C.muted, precision: 0, font: { size: 8 } },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Line data={data} options={options} />
    </Box>
  );
}

function StockReachChart({ rows }) {
  const data = {
    labels: rows.map((row) => shortDay(row.date)),
    datasets: [
      {
        label: "Unique leads reached",
        data: rows.map((row) => Number(row.stock_reach || 0)),
        borderColor: C.orange,
        backgroundColor: "rgba(245, 158, 11, 0.08)",
        borderWidth: 2,
        pointRadius: 1.8,
        tension: 0.32,
        fill: true,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: chartTooltip() },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.muted, maxTicksLimit: 7, font: { size: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: C.grid },
        border: { display: false },
        ticks: { color: C.muted, precision: 0, font: { size: 8 } },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Line data={data} options={options} />
    </Box>
  );
}

function EmailQualityDonut({ leads }) {
  const usable = Number(leads?.usableEmail || 0);
  const total = Number(leads?.total || 0);
  const missing = Math.max(0, total - usable);
  const data = {
    labels: ["Usable email", "Missing email"],
    datasets: [
      {
        data: [usable, missing],
        backgroundColor: [C.blue, "#d9dee8"],
        borderColor: "#fff",
        borderWidth: 3,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "63%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, color: C.muted, font: { size: 9 } },
      },
      tooltip: chartTooltip(),
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Doughnut data={data} options={options} />
    </Box>
  );
}

function LeadQualityTrend({ leads }) {
  const months = (leads?.qualityHistory?.months || []).slice(-6);
  const data = {
    labels: months.map((row) => String(row.month || "").slice(5)),
    datasets: [
      {
        label: "Email coverage",
        data: months.map((row) => Number(row.emailCoverage || 0)),
        borderColor: C.blue,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
      },
      {
        label: "Decision contacts",
        data: months.map((row) => Number(row.contactCoverage || 0)),
        borderColor: C.orange,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
      },
      {
        label: "High priority",
        data: months.map((row) => Number(row.highPriorityShare || 0)),
        borderColor: C.green,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, color: C.muted, font: { size: 8 } },
      },
      tooltip: chartTooltip(),
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.muted, font: { size: 8 } },
      },
      y: {
        beginAtZero: true,
        suggestedMax: 100,
        grid: { color: C.grid },
        border: { display: false },
        ticks: { color: C.muted, font: { size: 8 }, callback: (value) => `${value}%` },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Line data={data} options={options} />
    </Box>
  );
}

function SendReadyBars({ source }) {
  const total = Number(source?.leads?.total || 0);
  const usable = Number(source?.leads?.usableEmail || 0);
  const decision = Number(source?.leads?.decisionContacts || 0);
  const ready = Number(source?.dataQuality?.ready_leads || 0);
  const verified = Number(source?.dataQuality?.verified_ready_leads || 0);
  const data = {
    labels: [
      "Total leads",
      "Usable email",
      "Decision contacts",
      "Enrichment-ready",
      "Verified send-ready",
    ],
    datasets: [
      {
        data: [total, usable, decision, ready, verified],
        backgroundColor: [C.navy, C.blue, "#66a6dd", C.green, C.purple],
        borderRadius: 2,
      },
    ],
  };
  const options = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: chartTooltip() },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: C.grid },
        border: { display: false },
        ticks: { color: C.muted, font: { size: 8 } },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.text, font: { size: 8 } },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Bar data={data} options={options} />
    </Box>
  );
}

function StockComparisonChart({ stock }) {
  const current = stock?.current || {};
  const previous = stock?.comparison?.previous || {};
  const hasBaseline = Boolean(stock?.comparison?.previous);
  const products = stock?.productMovement || [];
  const labels = products.map((row) => row.product_group);
  const currentValues = products.map((row) => Number(row.area_m2 || 0));
  const previousValues = products.map((row) => Number(row.previous_area_m2 || 0));
  const data = {
    labels: labels.length ? labels : ["Total stock"],
    datasets: [
      {
        label: "This month",
        data: labels.length ? currentValues : [Number(current.total_area_m2 || 0)],
        backgroundColor: C.navy,
        borderRadius: 2,
      },
      ...(hasBaseline
        ? [
            {
              label: "Previous",
              data: labels.length ? previousValues : [Number(previous.total_area_m2 || 0)],
              backgroundColor: "#c8cfda",
              borderRadius: 2,
            },
          ]
        : []),
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, color: C.muted, font: { size: 8 } },
      },
      tooltip: {
        ...chartTooltip(),
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${number(ctx.raw, 0)} m²` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.text, font: { size: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: C.grid },
        border: { display: false },
        ticks: {
          color: C.muted,
          font: { size: 8 },
          callback: (value) => `${Math.round(Number(value) / 1000)}k`,
        },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Bar data={data} options={options} />
    </Box>
  );
}

function StockComposition({ stock }) {
  const rows = stock?.productMix || [];
  const palette = [C.navy, C.orange, C.blue, C.purple, C.gray];
  const data = {
    labels: rows.map((row) => row.label),
    datasets: [
      {
        data: rows.map((row) => Number(row.value || 0)),
        backgroundColor: rows.map((_, index) => palette[index % palette.length]),
        borderColor: "#fff",
        borderWidth: 3,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, color: C.muted, font: { size: 8 } },
      },
      tooltip: {
        ...chartTooltip(),
        callbacks: { label: (ctx) => `${ctx.label}: ${number(ctx.raw, 0)} m²` },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Doughnut data={data} options={options} />
    </Box>
  );
}

function PromotionReadyChart({ stock }) {
  const rows = stock?.productMovement || [];
  const data = {
    labels: rows.map((row) => row.product_group),
    datasets: [
      {
        label: "Current stock",
        data: rows.map((row) => Number(row.area_m2 || 0)),
        backgroundColor: C.orange,
        borderRadius: 2,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...chartTooltip(), callbacks: { label: (ctx) => `${number(ctx.raw, 0)} m²` } },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: C.text, font: { size: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: C.grid },
        border: { display: false },
        ticks: {
          color: C.muted,
          font: { size: 8 },
          callback: (value) => `${Math.round(Number(value) / 1000)}k`,
        },
      },
    },
  };
  return (
    <Box sx={{ height: 170 }}>
      <Bar data={data} options={options} />
    </Box>
  );
}

function QualityIssues({ quality }) {
  const total = Number(quality?.total_leads || quality?.total || 0);
  const rows = [
    ["Missing decision-maker", Number(quality?.missing_contact || 0), C.orange],
    ["Email not verified", Number(quality?.unverified_email || 0), C.coral],
    ["Missing company email", Number(quality?.missing_email || 0), C.blue],
    [
      "Duplicate domains",
      Number(quality?.duplicate_leads || quality?.duplicate_domains || 0),
      C.purple,
    ],
    ["Missing coordinates", Number(quality?.missing_coordinates || 0), C.green],
  ].sort((a, b) => b[1] - a[1]);

  return (
    <Box>
      {rows.map(([label, count, color], index) => {
        const share = total ? (count / total) * 100 : 0;
        return (
          <Box
            key={label}
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(150px,1.5fr) 70px 70px minmax(100px,1fr)",
              gap: 1,
              py: 0.7,
              alignItems: "center",
              borderTop: index ? `1px solid ${C.grid}` : 0,
            }}
          >
            <Typography sx={{ fontSize: 9.4, fontWeight: 600, color: C.text }}>{label}</Typography>
            <Typography sx={{ fontSize: 9.2, color: C.text, textAlign: "right" }}>
              {number(count)}
            </Typography>
            <Typography sx={{ fontSize: 9.2, color: C.muted, textAlign: "right" }}>
              {share.toFixed(1)}%
            </Typography>
            <Box sx={{ height: 5, backgroundColor: C.grid, overflow: "hidden" }}>
              <Box
                sx={{
                  width: `${Math.max(0, Math.min(100, share))}%`,
                  height: "100%",
                  backgroundColor: color,
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function LoadingReport() {
  return (
    <Box
      sx={{
        mt: 2,
        border: `1px solid ${C.border}`,
        backgroundColor: "#fff",
        borderRadius: "8px",
        minHeight: 360,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      <Box sx={{ width: "min(760px, 92%)", textAlign: "center" }}>
        <Box
          component="img"
          src={machineLoader}
          alt="Platform production line"
          sx={{
            width: "min(620px, 96%)",
            maxHeight: 225,
            objectFit: "contain",
            animation: "platformMachineFloat 1.7s ease-in-out infinite",
          }}
        />
        <Typography sx={{ mt: 0.7, fontSize: 17, fontWeight: 700, color: C.text }}>
          Generating report…
        </Typography>
        <Typography sx={{ mt: 0.4, fontSize: 11.5, color: C.muted }}>
          Collecting campaign, stock and data-quality metrics
        </Typography>
        <Box
          sx={{
            mx: "auto",
            mt: 2.3,
            width: "min(380px, 78%)",
            height: 6,
            overflow: "hidden",
            backgroundColor: C.grid,
            borderRadius: 99,
            position: "relative",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "38%",
              height: "100%",
              borderRadius: 99,
              backgroundColor: C.blue,
              animation: "platformLoaderTravel 1.35s ease-in-out infinite",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default function Reports() {
  const state = useAsyncData(getReportingData, [], { cacheKey: "dashboard-report-source" });
  const [defaultStart, defaultEnd] = monthBounds();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [includeLeads, setIncludeLeads] = useState(true);
  const [includeQuality, setIncludeQuality] = useState(true);
  const [includeStock, setIncludeStock] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);

  const source = state.data;
  const filteredDaily = useMemo(() => {
    const rows = source?.campaignDaily || [];
    return rows.filter((row) => {
      const day = String(row?.date || "").slice(0, 10);
      return day && day >= startDate && day <= endDate;
    });
  }, [source, startDate, endDate]);

  const periodReach = useMemo(
    () =>
      filteredDaily.reduce(
        (acc, row) => ({
          lead: acc.lead + Number(row?.lead_reach || 0),
          stock: acc.stock + Number(row?.stock_reach || 0),
        }),
        { lead: 0, stock: 0 }
      ),
    [filteredDaily]
  );

  async function generate() {
    if (!includeLeads && !includeQuality && !includeStock) return;
    setGenerating(true);
    setReport(null);
    await new Promise((resolve) => setTimeout(resolve, 1250));

    const { leads, stock, dataQuality } = source;
    const findings = [];
    if (includeLeads) {
      findings.push(
        `Lead portfolio: ${number(leads?.total || 0)} records across ${number(
          leads?.countries || 0
        )} countries, with ${Number(leads?.emailCoverage || 0).toFixed(1)}% usable-email coverage.`
      );
      findings.push(
        `Lead outreach reached ${number(
          periodReach.lead
        )} unique lead/day touchpoints during the selected period.`
      );
    }
    if (includeQuality) {
      findings.push(
        `Decision-contact coverage is ${Number(leads?.contactCoverage || 0).toFixed(
          1
        )}%; enrichment-ready is ${Number(dataQuality?.readiness_pct || 0).toFixed(
          1
        )}% and verified send-ready is ${Number(dataQuality?.verified_readiness_pct || 0).toFixed(
          1
        )}%.`
      );
    }
    if (includeStock) {
      const stockDelta = stock?.comparison?.deltaPct;
      findings.push(
        `Current stock is ${number(stock?.current?.total_area_m2 || 0, 0)} m² across ${number(
          stock?.current?.row_count || 0
        )} models. ${
          stockDelta == null
            ? "No approved comparison baseline is available."
            : `Inventory is ${stockDelta >= 0 ? "up" : "down"} ${percent(
                Math.abs(stockDelta)
              )} versus the previous approved snapshot.`
        }`
      );
      findings.push(
        `Stock outreach reached ${number(
          periodReach.stock
        )} unique lead/day touchpoints during the selected period.`
      );
    }

    setReport({
      startDate,
      endDate,
      includeLeads,
      includeQuality,
      includeStock,
      generatedAt: new Date().toLocaleString(),
      findings,
      daily: filteredDaily,
      reach: { ...periodReach },
    });
    setGenerating(false);
  }

  const nothingSelected = !includeLeads && !includeQuality && !includeStock;
  const reportMetrics = useMemo(() => {
    if (!report || !source) return [];
    const metrics = [];
    const { leads, stock, dataQuality } = source;
    if (report.includeLeads) {
      metrics.push([
        "Total leads",
        number(leads?.total || 0),
        `${number(leads?.countries || 0)} countries`,
        C.blue,
      ]);
      metrics.push([
        "Usable email",
        `${Number(leads?.emailCoverage || 0).toFixed(1)}%`,
        `${number(leads?.usableEmail || 0)} contactable`,
        C.blue,
      ]);
      metrics.push([
        "Lead reach",
        number(report.reach.lead),
        `${report.startDate} → ${report.endDate}`,
        C.blue,
      ]);
    }
    if (report.includeQuality) {
      metrics.push([
        "Decision contacts",
        `${Number(leads?.contactCoverage || 0).toFixed(1)}%`,
        `${number(leads?.decisionContacts || 0)} named contacts`,
        C.orange,
      ]);
      metrics.push([
        "Verified send-ready",
        `${Number(dataQuality?.verified_readiness_pct || 0).toFixed(1)}%`,
        `${number(dataQuality?.verified_ready_leads || 0)} leads`,
        C.green,
      ]);
    }
    if (report.includeStock) {
      metrics.push([
        "Current stock",
        `${number(stock?.current?.total_area_m2 || 0, 0)} m²`,
        `${number(stock?.current?.row_count || 0)} models`,
        C.orange,
      ]);
      metrics.push([
        "Stock campaign reach",
        number(report.reach.stock),
        `${report.startDate} → ${report.endDate}`,
        C.orange,
      ]);
    }
    return metrics;
  }, [report, source]);

  return (
    <DashboardLayout>
      <style>{REPORT_PRINT_CSS}</style>
      <DashboardNavbar />
      <Box sx={{ py: { xs: 2, sm: 3 } }}>
        <PageState loading={state.loading} error={state.error} label="Loading reporting data…">
          {source ? (
            <>
              <Box className="platform-no-print" sx={{ mb: 1.7 }}>
                <Typography sx={{ fontSize: 25, fontWeight: 700, color: C.text }}>
                  Reports
                </Typography>
                <Typography sx={{ mt: 0.35, fontSize: 12.5, color: C.muted }}>
                  Build a clean management report from only the intelligence sections you select.
                </Typography>
              </Box>

              <Box
                className="platform-no-print"
                sx={{
                  border: `1px solid ${C.border}`,
                  borderRadius: "8px",
                  backgroundColor: "#fff",
                  px: { xs: 1.4, md: 1.8 },
                  py: 1.15,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: { xs: 0.6, md: 1.05 },
                    alignItems: "center",
                  }}
                >
                  <TextField
                    sx={{ width: 148 }}
                    size="small"
                    type="date"
                    label="From"
                    InputLabelProps={{ shrink: true }}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                  <TextField
                    sx={{ width: 148 }}
                    size="small"
                    type="date"
                    label="To"
                    InputLabelProps={{ shrink: true }}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                  <Toggle
                    checked={includeLeads}
                    onChange={setIncludeLeads}
                    label="Lead intelligence"
                  />
                  <Toggle
                    checked={includeQuality}
                    onChange={setIncludeQuality}
                    label="Data quality"
                  />
                  <Toggle
                    checked={includeStock}
                    onChange={setIncludeStock}
                    label="Stock intelligence"
                  />
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={generating || nothingSelected}
                    onClick={generate}
                    sx={{
                      ml: { lg: "auto" },
                      minWidth: 132,
                      height: 38,
                      backgroundColor: C.navy,
                      borderRadius: "6px",
                      textTransform: "none",
                      fontWeight: 650,
                    }}
                  >
                    Generate report
                  </Button>
                  {report ? (
                    <Button
                      variant="outlined"
                      onClick={() => window.print()}
                      sx={{
                        minWidth: 132,
                        height: 38,
                        borderRadius: "6px",
                        textTransform: "none",
                        color: C.navy,
                        borderColor: C.border,
                        fontWeight: 650,
                      }}
                    >
                      Print / Save PDF
                    </Button>
                  ) : null}
                </Box>
                {nothingSelected ? (
                  <Typography sx={{ mt: 0.65, fontSize: 10.5, color: C.coral }}>
                    Select at least one report section.
                  </Typography>
                ) : null}
              </Box>

              {generating ? <LoadingReport /> : null}

              {report ? (
                <Box
                  id="platform-generated-report"
                  sx={{
                    mt: 2,
                    backgroundColor: "#fff",
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                    p: { xs: 1.6, md: 2.1 },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 2,
                      alignItems: "flex-start",
                      borderBottom: `1px solid ${C.border}`,
                      pb: 1.35,
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 20, fontWeight: 700, color: C.text }}>
                        {APP_NAME} Report
                      </Typography>
                      <Typography sx={{ mt: 0.2, fontSize: 10.5, color: C.muted }}>
                        {report.startDate} → {report.endDate}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 9.5, color: C.muted }}>
                      Generated {report.generatedAt}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      mt: 1.4,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "repeat(2,minmax(0,1fr))",
                        md: `repeat(${Math.min(
                          5,
                          Math.max(1, reportMetrics.length)
                        )}, minmax(0,1fr))`,
                      },
                      borderTop: `1px solid ${C.border}`,
                      borderLeft: `1px solid ${C.border}`,
                    }}
                  >
                    {reportMetrics.map(([label, value, detail, accent]) => (
                      <MetricCell
                        key={label}
                        label={label}
                        value={value}
                        detail={detail}
                        accent={accent}
                      />
                    ))}
                  </Box>

                  {report.includeLeads ? (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography sx={{ mb: 0.85, fontSize: 13, fontWeight: 700, color: C.text }}>
                        Lead intelligence
                      </Typography>
                      <Grid container spacing={1.2}>
                        <Grid item xs={12} md={4}>
                          <ReportPanel
                            title="Lead campaign reach"
                            subtitle="Daily unique leads reached"
                          >
                            <LeadReachChart rows={report.daily} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <ReportPanel title="Email quality" subtitle="Contactable portfolio share">
                            <EmailQualityDonut leads={source.leads} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <ReportPanel
                            title="Lead quality trend"
                            subtitle="Six-month contactability and priority movement"
                          >
                            <LeadQualityTrend leads={source.leads} />
                          </ReportPanel>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : null}

                  {report.includeQuality ? (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography sx={{ mb: 0.85, fontSize: 13, fontWeight: 700, color: C.text }}>
                        Data quality
                      </Typography>
                      <Grid container spacing={1.2}>
                        <Grid item xs={12} md={5}>
                          <ReportPanel
                            title="Send-readiness progression"
                            subtitle="How many leads survive each readiness gate"
                          >
                            <SendReadyBars source={source} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={7}>
                          <ReportPanel
                            title="Data-quality priorities"
                            subtitle="Largest gaps to correct next"
                          >
                            <QualityIssues quality={source.dataQuality} />
                          </ReportPanel>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : null}

                  {report.includeStock ? (
                    <Box
                      sx={{ mt: 1.5 }}
                      className={
                        report.includeLeads || report.includeQuality
                          ? "platform-report-page-break"
                          : ""
                      }
                    >
                      <Typography sx={{ mb: 0.85, fontSize: 13, fontWeight: 700, color: C.text }}>
                        Stock intelligence
                      </Typography>
                      <Grid container spacing={1.2}>
                        <Grid item xs={12} md={3}>
                          <ReportPanel
                            title="Stock movement"
                            subtitle="Current vs previous approved snapshot"
                          >
                            <StockComparisonChart stock={source.stock} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <ReportPanel
                            title="Stock composition"
                            subtitle="Current inventory by product family"
                          >
                            <StockComposition stock={source.stock} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <ReportPanel
                            title="Current product stock"
                            subtitle="Promotion-ready inventory by family"
                          >
                            <PromotionReadyChart stock={source.stock} />
                          </ReportPanel>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <ReportPanel
                            title="Stock campaign reach"
                            subtitle="Daily unique leads reached"
                          >
                            <StockReachChart rows={report.daily} />
                          </ReportPanel>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : null}

                  <ReportPanel
                    title="Management interpretation"
                    subtitle="Automatic interpretation of the selected report sections"
                    sx={{ mt: 1.5 }}
                  >
                    <Box component="ul" sx={{ m: 0, pl: 2.1 }}>
                      {report.findings.map((finding) => (
                        <Typography
                          component="li"
                          key={finding}
                          sx={{ mb: 0.55, fontSize: 10.2, lineHeight: 1.45, color: C.text }}
                        >
                          {finding}
                        </Typography>
                      ))}
                    </Box>
                  </ReportPanel>
                </Box>
              ) : null}
            </>
          ) : null}
        </PageState>
      </Box>
      <Footer />
    </DashboardLayout>
  );
}
