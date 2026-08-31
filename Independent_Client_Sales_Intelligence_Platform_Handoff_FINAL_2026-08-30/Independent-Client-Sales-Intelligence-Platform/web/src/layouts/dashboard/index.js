import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import PageState from "components/Platform/PageState";
import useAsyncData from "hooks/useAsyncData";
import { getDashboardData } from "services/api";
import { number, percent } from "lib/format";
import { Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Filler
);

const COLORS = {
  navy: "#1677FF",
  blue: "#1677FF",
  orange: "#FAAD14",
  coral: "#FF4D4F",
  green: "#52C41A",
  red: "#FF4D4F",
  purple: "#722ED1",
  pale: "#91CAFF",
  text: "#262626",
  muted: "#8C8C8C",
  border: "#E6EBF1",
  grid: "#F0F0F0",
  surface: "#FFFFFF",
  soft: "#FAFAFA",
};

function OutlineIcon({ name, size = 18, color = "inherit" }) {
  return (
    <Icon
      baseClassName="material-icons-outlined"
      sx={{ fontSize: `${size}px !important`, lineHeight: 1, color }}
    >
      {name}
    </Icon>
  );
}

OutlineIcon.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.number,
  color: PropTypes.string,
};

function useReplayOnView() {
  const ref = useRef(null);
  const [animationKey, setAnimationKey] = useState(0);
  const visibleRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visibleRef.current) {
          visibleRef.current = true;
          setAnimationKey((value) => value + 1);
        } else if (!entry.isIntersecting) {
          visibleRef.current = false;
        }
      },
      { threshold: 0.32 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, animationKey };
}

function pct(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "—";
}

function shortDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(5);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Section({ children, sx = {} }) {
  return (
    <Card
      sx={{
        borderRadius: "8px",
        border: `1px solid ${COLORS.border}`,
        boxShadow: "none",
        overflow: "hidden",
        minWidth: 0,
        ...sx,
      }}
    >
      {children}
    </Card>
  );
}

Section.propTypes = {
  children: PropTypes.node.isRequired,
  sx: PropTypes.objectOf(PropTypes.any),
};

function Metric({ icon, label, value, detail, accent = COLORS.navy }) {
  return (
    <Box
      sx={{
        p: 2.1,
        minHeight: 112,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "8px",
        backgroundColor: COLORS.surface,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <MDTypography
          variant="caption"
          sx={{ color: COLORS.muted, fontWeight: 700, fontSize: 11.2 }}
        >
          {label}
        </MDTypography>
        <Box sx={{ color: accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
          {icon}
        </Box>
      </Stack>
      <MDTypography
        variant="h5"
        sx={{ color: COLORS.text, fontWeight: 700, mt: 1.05, letterSpacing: "-0.025em" }}
      >
        {value}
      </MDTypography>
      <MDTypography
        variant="caption"
        sx={{ color: COLORS.muted, display: "block", mt: 0.65, lineHeight: 1.35 }}
      >
        {detail}
      </MDTypography>
    </Box>
  );
}

Metric.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  detail: PropTypes.node.isRequired,
  accent: PropTypes.string,
};

function DailyReachChart({ outreach }) {
  const replay = useReplayOnView();
  const rows = (outreach?.daily || []).filter((row) => row.date).slice(-30);
  const labels = rows.map((row) => shortDate(row.date));
  const leadReach = rows.map((row) => Number(row.lead_reach || 0));
  const stockReach = rows.map((row) => Number(row.stock_reach || 0));

  const data = {
    labels,
    datasets: [
      {
        label: "Lead campaign reach",
        data: leadReach,
        borderColor: COLORS.coral,
        backgroundColor: "rgba(255, 124, 115, 0.10)",
        borderWidth: 2.6,
        pointRadius: 2.4,
        pointHoverRadius: 5,
        pointBackgroundColor: COLORS.surface,
        pointBorderColor: COLORS.coral,
        pointBorderWidth: 2,
        tension: 0.38,
        fill: true,
      },
      {
        label: "Stock campaign reach",
        data: stockReach,
        borderColor: COLORS.purple,
        backgroundColor: "rgba(143, 122, 245, 0.05)",
        borderWidth: 2.6,
        pointRadius: 2.4,
        pointHoverRadius: 5,
        pointBackgroundColor: COLORS.surface,
        pointBorderColor: COLORS.purple,
        pointBorderWidth: 2,
        tension: 0.38,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.surface,
        titleColor: COLORS.text,
        bodyColor: COLORS.muted,
        borderColor: COLORS.border,
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: COLORS.muted,
          autoSkip: false,
          maxRotation: 0,
          font: { size: 10 },
          callback(value, index, ticks) {
            const isLast = index === ticks.length - 1;
            const step = Math.max(1, Math.ceil((ticks.length - 1) / 6));
            if (!isLast && index % step !== 0) return "";
            return this.getLabelForValue(value);
          },
        },
      },
      y: {
        beginAtZero: true,
        grace: "10%",
        grid: { color: COLORS.grid },
        border: { display: false },
        ticks: { color: COLORS.muted, precision: 0, font: { size: 10 } },
      },
    },
  };

  return (
    <Section>
      <Box sx={{ px: 2.5, pt: 2.4, pb: 1.25 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2}>
          <Box>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
              Daily campaign reach
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              Daily unique leads reached by the main lead campaign and the stock campaign
            </MDTypography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Stack direction="row" spacing={0.6} alignItems="center">
              <Box
                sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: COLORS.coral }}
              />
              <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                Lead campaign
              </MDTypography>
            </Stack>
            <Stack direction="row" spacing={0.6} alignItems="center">
              <Box
                sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: COLORS.purple }}
              />
              <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                Stock campaign
              </MDTypography>
            </Stack>
          </Stack>
        </Stack>
      </Box>
      <Box ref={replay.ref} sx={{ px: 2.5, pb: 2.4, height: 294, minWidth: 0 }}>
        <Line key={`daily-reach-${replay.animationKey}`} data={data} options={options} />
      </Box>
    </Section>
  );
}

DailyReachChart.propTypes = {
  outreach: PropTypes.objectOf(PropTypes.any),
};

function StockComparison({ stock }) {
  const replay = useReplayOnView();
  const current = stock.current || {};
  const previous = stock.comparison?.previous || null;
  const currentTotal = Number(current.total_area_m2 || 0);
  const previousTotal = previous ? Number(previous.total_area_m2 || 0) : null;
  const currentPromo = Number(current.promotional_area_m2 || 0);
  const previousPromo = previous ? Number(previous.promotional_area_m2 || 0) : null;
  const summaryOnly = Boolean(stock.summaryOnly || current.summary_only);

  const labels = previous ? ["Previous stock", "Current stock"] : ["Current stock"];
  const datasets = [
    {
      label: "Total stock",
      data: previous ? [previousTotal, currentTotal] : [currentTotal],
      borderColor: COLORS.navy,
      backgroundColor: "transparent",
      borderWidth: 2.6,
      pointRadius: 3.2,
      pointBackgroundColor: COLORS.surface,
      pointBorderColor: COLORS.navy,
      pointBorderWidth: 2,
      tension: 0.32,
    },
  ];

  if (!summaryOnly) {
    datasets.push({
      label: "Promotion-ready",
      data: previous ? [previousPromo, currentPromo] : [currentPromo],
      borderColor: COLORS.orange,
      backgroundColor: "transparent",
      borderWidth: 2.6,
      pointRadius: 3.2,
      pointBackgroundColor: COLORS.surface,
      pointBorderColor: COLORS.orange,
      pointBorderWidth: 2,
      tension: 0.32,
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.surface,
        titleColor: COLORS.text,
        bodyColor: COLORS.muted,
        borderColor: COLORS.border,
        borderWidth: 1,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${number(ctx.raw, 0)} m²` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: COLORS.muted, font: { size: 10 } },
      },
      y: {
        beginAtZero: false,
        grid: { color: COLORS.grid },
        border: { display: false },
        ticks: {
          color: COLORS.muted,
          font: { size: 10 },
          callback: (value) => `${Math.round(Number(value) / 1000)}k`,
        },
      },
    },
  };

  return (
    <Section>
      <Box sx={{ px: 2.5, pt: 2.4, pb: 1.25 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.2}>
          <Box>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
              Stock comparison
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              {summaryOnly
                ? "Latest stock summary compared with the previous approved detailed snapshot"
                : "Current month compared with the previous approved snapshot"}
            </MDTypography>
          </Box>
          <Stack direction="row" spacing={1.3} alignItems="center" flexWrap="wrap" useFlexGap>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box
                sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: COLORS.navy }}
              />
              <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                Total stock
              </MDTypography>
            </Stack>
            {!summaryOnly ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: COLORS.orange }}
                />
                <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                  Promotion-ready
                </MDTypography>
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </Box>
      <Box ref={replay.ref} sx={{ px: 2.5, pb: 2.35, height: 248 }}>
        <Line key={`stock-comparison-${replay.animationKey}`} data={data} options={options} />
      </Box>
    </Section>
  );
}

StockComparison.propTypes = {
  stock: PropTypes.objectOf(PropTypes.any).isRequired,
};

function StockComposition({ stock }) {
  const replay = useReplayOnView();
  const palette = [COLORS.navy, COLORS.coral, COLORS.orange, COLORS.purple, COLORS.pale];
  const source = (stock.productMix || []).filter((row) => Number(row.value || 0) > 0);
  const primary = source.slice(0, 4);
  const remainder = source.slice(4);
  const rows = [...primary];

  if (remainder.length) {
    rows.push({
      label: "Other",
      value: remainder.reduce((sum, row) => sum + Number(row.value || 0), 0),
    });
  }

  const values = rows.map((row) => Number(row.value || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const labels = rows.map((row) =>
    String(row.label || "Other").replace("Luxury Vinyl Tile", "LVT")
  );
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: rows.map((_, index) => palette[index % palette.length]),
        borderColor: COLORS.surface,
        borderWidth: 5,
        spacing: 2,
        hoverOffset: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "58%",
    rotation: -72,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.surface,
        titleColor: COLORS.text,
        bodyColor: COLORS.muted,
        borderColor: COLORS.border,
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            const share = total ? (Number(context.raw || 0) / total) * 100 : 0;
            return `${context.label}: ${number(context.raw, 0)} m² · ${share.toFixed(1)}%`;
          },
        },
      },
    },
  };

  return (
    <Section sx={{ height: "100%" }}>
      <Box sx={{ px: 2.5, pt: 2.4, pb: 1.1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
              Stock composition
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              Same ring structure as your reference, driven by real product mix data
            </MDTypography>
          </Box>
          <OutlineIcon name="more_horiz" size={18} color={COLORS.text} />
        </Stack>
      </Box>

      <Box ref={replay.ref} sx={{ position: "relative", height: 230, px: 0.5 }}>
        <Doughnut key={`stock-composition-${replay.animationKey}`} data={data} options={options} />
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <MDTypography
            variant="h5"
            sx={{ color: COLORS.text, fontWeight: 700, letterSpacing: "-0.03em" }}
          >
            {number(total, 0)}
          </MDTypography>
          <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
            m² total
          </MDTypography>
        </Box>
      </Box>

      <Box sx={{ px: 2.5, pb: 2.4 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 0.95,
          }}
        >
          {labels.map((label, index) => (
            <Stack key={label} direction="row" spacing={0.7} alignItems="center" minWidth={0}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: palette[index % palette.length],
                  flexShrink: 0,
                }}
              />
              <MDTypography
                variant="caption"
                sx={{
                  color: COLORS.muted,
                  fontSize: 10,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {label}
              </MDTypography>
            </Stack>
          ))}
        </Box>
      </Box>
    </Section>
  );
}

StockComposition.propTypes = {
  stock: PropTypes.objectOf(PropTypes.any).isRequired,
};

function StockSnapshotMetrics({ stock, outreach }) {
  const current = stock.current || {};
  const deltaPct = stock.comparison?.deltaPct;
  const deltaArea = stock.comparison?.deltaArea;
  const summaryOnly = Boolean(stock.summaryOnly || current.summary_only);
  const promoShare = Number(current.total_area_m2)
    ? (Number(current.promotional_area_m2 || 0) / Number(current.total_area_m2)) * 100
    : 0;

  const movementLabel =
    deltaPct == null
      ? "Previous approved snapshot not available"
      : `${deltaPct >= 0 ? "+" : ""}${percent(deltaPct)} · ${deltaArea >= 0 ? "+" : ""}${number(
          deltaArea,
          0
        )} m²`;
  const movementColor =
    deltaPct == null
      ? COLORS.muted
      : Number(deltaPct) > 0
      ? COLORS.orange
      : Number(deltaPct) < 0
      ? COLORS.green
      : COLORS.muted;

  return (
    <Section>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.4}>
          <Box minWidth={0}>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
              Stock intelligence
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted, display: "block", mt: 0.2 }}>
              {summaryOnly
                ? "Current stock by product family, all reported above the 20 m² threshold"
                : "Inventory level, promotion readiness and market reach"}
            </MDTypography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.55,
              px: 1,
              py: 0.55,
              borderRadius: 999,
              backgroundColor: COLORS.soft,
              flexShrink: 0,
            }}
          >
            <Box
              sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: movementColor }}
            />
            <MDTypography
              variant="caption"
              sx={{ color: movementColor, fontWeight: 700, fontSize: 9.8 }}
            >
              {deltaPct == null ? "BASELINE PENDING" : "MONTHLY MOVEMENT"}
            </MDTypography>
          </Box>
        </Stack>

        <Box sx={{ mt: 2.15 }}>
          <MDTypography variant="caption" sx={{ color: COLORS.muted, fontWeight: 600 }}>
            TOTAL STOCK
          </MDTypography>
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            spacing={1.5}
            mt={0.45}
          >
            <MDTypography
              variant="h3"
              sx={{
                color: COLORS.text,
                fontWeight: 700,
                letterSpacing: "-0.045em",
                fontSize: { xs: 28, xl: 31 },
              }}
            >
              {number(current.total_area_m2 || 0, 0)} m²
            </MDTypography>
            <MDTypography
              variant="caption"
              sx={{ color: movementColor, textAlign: "right", lineHeight: 1.3 }}
            >
              {movementLabel}
            </MDTypography>
          </Stack>
        </Box>

        <Divider sx={{ my: 2, borderColor: COLORS.border }} />

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={1}>
            <Box>
              <MDTypography variant="caption" sx={{ color: COLORS.muted, fontWeight: 600 }}>
                {summaryOnly ? "STOCK ABOVE 20 M²" : "PROMOTION-READY"}
              </MDTypography>
              <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700, mt: 0.45 }}>
                {number(summaryOnly ? current.total_area_m2 : current.promotional_area_m2 || 0, 0)}{" "}
                m²
              </MDTypography>
            </Box>
            <MDTypography variant="button" sx={{ color: COLORS.orange, fontWeight: 700 }}>
              {summaryOnly ? `${number(current.row_count || 0)} models` : pct(promoShare)}
            </MDTypography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={summaryOnly ? 100 : Math.max(0, Math.min(100, promoShare))}
            sx={{
              mt: 1.05,
              height: 7,
              borderRadius: 999,
              backgroundColor: COLORS.grid,
              "& .MuiLinearProgress-bar": { borderRadius: 999, backgroundColor: COLORS.orange },
            }}
          />
        </Box>

        <Box
          sx={{
            mt: 2.15,
            pt: 1.8,
            borderTop: `1px solid ${COLORS.border}`,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1.25,
          }}
        >
          <Box minWidth={0}>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              Leads reached
            </MDTypography>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700, mt: 0.35 }}>
              {number(outreach?.stockReachedThisMonth || 0)}
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted, fontSize: 9.6 }}>
              this month
            </MDTypography>
          </Box>
          <Box minWidth={0} sx={{ pl: 1.25, borderLeft: `1px solid ${COLORS.border}` }}>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              Countries
            </MDTypography>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700, mt: 0.35 }}>
              {number(outreach?.stockCountriesReached ?? stock.countriesReached ?? 0)}
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted, fontSize: 9.6 }}>
              reached
            </MDTypography>
          </Box>
          <Box minWidth={0} sx={{ pl: 1.25, borderLeft: `1px solid ${COLORS.border}` }}>
            <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
              Emails
            </MDTypography>
            <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700, mt: 0.35 }}>
              {number(stock.sentThisMonth || 0)}
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: COLORS.muted, fontSize: 9.6 }}>
              stock outreach
            </MDTypography>
          </Box>
        </Box>
      </Box>
    </Section>
  );
}

StockSnapshotMetrics.propTypes = {
  stock: PropTypes.objectOf(PropTypes.any).isRequired,
  outreach: PropTypes.objectOf(PropTypes.any),
};

function StockOpportunityQueue({ stock }) {
  const rows = (stock.actionQueue || []).slice(0, 6);
  const totalArea = rows.reduce((sum, row) => sum + Number(row.stock_area_m2 || 0), 0);
  const totalEmails = rows.reduce((sum, row) => sum + Number(row.emails_sent || 0), 0);
  const exposedArea = rows
    .filter((row) => Number(row.emails_sent || 0) > 0)
    .reduce((sum, row) => sum + Number(row.stock_area_m2 || 0), 0);
  const exposedShare = totalArea ? (exposedArea / totalArea) * 100 : 0;
  const unexposedShare = Math.max(0, 100 - exposedShare);
  const largestFamily =
    [...rows].sort((a, b) => Number(b.share_pct || 0) - Number(a.share_pct || 0))[0] || {};
  const mostEmailed =
    [...rows].sort((a, b) => Number(b.emails_sent || 0) - Number(a.emails_sent || 0))[0] || {};
  const mostEmailedShare = totalEmails
    ? (Number(mostEmailed.emails_sent || 0) / totalEmails) * 100
    : 0;
  const models = rows.reduce((sum, row) => sum + Number(row.stock_items || 0), 0);
  const avgAreaPerModel = models ? totalArea / models : 0;

  const patternStats = [
    {
      label: "Largest stock family",
      value: largestFamily.product_group || "—",
      detail: largestFamily.product_group
        ? `${Number(largestFamily.share_pct || 0).toFixed(1)}% of current stock`
        : "No stock mix data",
      color: COLORS.navy,
    },
    {
      label: "Inventory with no stock-email exposure",
      value: `${unexposedShare.toFixed(1)}%`,
      detail: "Share of current stock sitting in families with zero recorded stock emails",
      color: unexposedShare >= 35 ? COLORS.red : COLORS.orange,
    },
    {
      label: "Email concentration",
      value: totalEmails ? `${mostEmailedShare.toFixed(1)}%` : "—",
      detail: totalEmails
        ? `${mostEmailed.product_group || "One family"} receives this share of stock-email activity`
        : "No stock-email activity recorded",
      color: COLORS.purple,
    },
    {
      label: "Average stock per model",
      value: `${number(avgAreaPerModel, 0)} m²`,
      detail: `${number(models)} models across the displayed product families`,
      color: COLORS.green,
    },
  ];

  return (
    <Section>
      <Box sx={{ px: 2.5, pt: 2.35, pb: 1.2 }}>
        <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
          Stock mix & campaign exposure
        </MDTypography>
        <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
          Compact stock-pattern view: inventory concentration, email exposure and under-worked
          product families
        </MDTypography>
      </Box>

      <Box sx={{ px: 2.5, pb: 1.6 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0,1fr))",
              xl: "repeat(4, minmax(0,1fr))",
            },
            gap: 1.1,
            mb: 1.55,
          }}
        >
          {patternStats.map((stat) => (
            <Box
              key={stat.label}
              sx={{
                p: 1.35,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "12px",
                backgroundColor: COLORS.soft,
                minWidth: 0,
              }}
            >
              <MDTypography
                variant="caption"
                sx={{ color: COLORS.muted, display: "block", fontWeight: 650 }}
              >
                {stat.label}
              </MDTypography>
              <MDTypography variant="h6" sx={{ color: stat.color, fontWeight: 750, mt: 0.25 }}>
                {stat.value}
              </MDTypography>
              <MDTypography
                variant="caption"
                sx={{ color: COLORS.muted, display: "block", mt: 0.2, lineHeight: 1.35 }}
              >
                {stat.detail}
              </MDTypography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" },
            gap: 1.1,
          }}
        >
          {rows.slice(0, 4).map((row) => {
            const share = Math.max(0, Math.min(100, Number(row.share_pct || 0)));
            const emails = Number(row.emails_sent || 0);
            const interested = Number(row.interested || 0);
            return (
              <Box
                key={row.product_group}
                sx={{
                  p: 1.35,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "12px",
                  minWidth: 0,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  spacing={1.25}
                  alignItems="flex-start"
                >
                  <Box minWidth={0}>
                    <MDTypography variant="button" sx={{ color: COLORS.text, fontWeight: 700 }}>
                      {row.product_group}
                    </MDTypography>
                    <MDTypography
                      variant="caption"
                      sx={{ color: COLORS.muted, display: "block", mt: 0.1 }}
                    >
                      {number(row.stock_items || 0)} models · {number(row.stock_area_m2 || 0, 0)} m²
                    </MDTypography>
                  </Box>
                  <Box textAlign="right" flexShrink={0}>
                    <MDTypography variant="button" sx={{ color: COLORS.text, fontWeight: 750 }}>
                      {share.toFixed(1)}%
                    </MDTypography>
                    <MDTypography variant="caption" sx={{ color: COLORS.muted, display: "block" }}>
                      {number(emails)} emails
                    </MDTypography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    mt: 0.9,
                    height: 7,
                    borderRadius: 999,
                    backgroundColor: COLORS.grid,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      width: `${share}%`,
                      minWidth: share > 0 ? 3 : 0,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: emails > 0 ? COLORS.orange : COLORS.pale,
                    }}
                  />
                </Box>
                <Stack direction="row" justifyContent="space-between" spacing={1} mt={0.55}>
                  <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                    Inventory share
                  </MDTypography>
                  <MDTypography
                    variant="caption"
                    sx={{
                      color: interested > 0 ? COLORS.green : COLORS.muted,
                      fontWeight: interested > 0 ? 700 : 500,
                    }}
                  >
                    {interested > 0
                      ? `${number(interested)} interested`
                      : emails > 0
                      ? "Exposed, no interest yet"
                      : "No campaign exposure"}
                  </MDTypography>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Section>
  );
}

StockOpportunityQueue.propTypes = {
  stock: PropTypes.objectOf(PropTypes.any).isRequired,
};

function DashboardContent({ data }) {
  const { stock, leads, dataQuality } = data;
  const outreach = data.outreach || stock.campaignReach || {};

  return (
    <>
      {stock.preview ? (
        <Alert severity="info" sx={{ mb: 2.4 }}>
          Preview mode uses repository demo data. Live Supabase replaces these values automatically.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
          gap: 1.8,
        }}
      >
        <Metric
          icon={<OutlineIcon name="business" size={18} />}
          label="Total leads"
          value={number(leads.total)}
          detail={`${number(leads.available)} available · ${number(leads.countries)} countries`}
        />
        <Metric
          icon={<OutlineIcon name="rocket_launch" size={18} />}
          label="Sales-ready leads"
          value={number(dataQuality?.sales_ready_leads || 0)}
          detail={`${pct(dataQuality?.sales_ready_pct || 0)} of the portfolio can be worked now`}
          accent={COLORS.green}
        />
        <Metric
          icon={<OutlineIcon name="filter_alt" size={18} />}
          label="Target-fit backlog"
          value={number(dataQuality?.target_fit_backlog || 0)}
          detail="Relevant leads still blocked by contact-data gaps"
          accent={COLORS.orange}
        />
        <Metric
          icon={<OutlineIcon name="mark_email_read" size={18} />}
          label="Qualified replies"
          value={number(dataQuality?.qualified_reply_count || 0)}
          detail={`${number(dataQuality?.human_reply_count || 0)} human replies observed`}
          accent={COLORS.purple}
        />
        <Metric
          icon={<OutlineIcon name="science" size={18} />}
          label="Score validation sample"
          value={number(dataQuality?.outcome_sample_size || 0)}
          detail="Contacted leads available to test whether B2B score predicts outcomes"
          accent={COLORS.blue}
        />
        <Metric
          icon={<OutlineIcon name="campaign" size={18} />}
          label="Lead-campaign reach"
          value={number(outreach.leadReachedThisMonth || 0)}
          detail={`${number(outreach.leadCountriesReached || 0)} countries reached this month`}
          accent={COLORS.coral}
        />
      </Box>

      <Grid container spacing={2.4} mt={0.4} alignItems="stretch">
        <Grid item xs={12} xl={8} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <DailyReachChart outreach={outreach} />
          </Box>
        </Grid>
        <Grid item xs={12} xl={4} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <StockSnapshotMetrics stock={stock} outreach={outreach} />
          </Box>
        </Grid>
      </Grid>

      <Grid container spacing={2.4} mt={0.2} alignItems="stretch">
        <Grid item xs={12} lg={6} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <StockComparison stock={stock} />
          </Box>
        </Grid>
        <Grid item xs={12} lg={6} sx={{ display: "flex" }}>
          <Box sx={{ width: "100%" }}>
            <StockComposition stock={stock} />
          </Box>
        </Grid>
      </Grid>

      <Grid container spacing={2.4} mt={0.2}>
        <Grid item xs={12}>
          <StockOpportunityQueue stock={stock} />
        </Grid>
      </Grid>
    </>
  );
}

DashboardContent.propTypes = {
  data: PropTypes.objectOf(PropTypes.any).isRequired,
};

function Dashboard() {
  const state = useAsyncData(getDashboardData, []);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={2.2} sx={{ minWidth: 0, overflowX: "hidden" }}>
        <PageState
          loading={state.loading}
          error={state.error}
          label="Loading Platform intelligence…"
        >
          {state.data ? <DashboardContent data={state.data} /> : <MDBox />}
        </PageState>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
