/* eslint-disable react/prop-types */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import Stack from "@mui/material/Stack";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import useAsyncData from "hooks/useAsyncData";
import { getDataQuality } from "services/api";
import { number } from "lib/format";

const COLORS = {
  navy: "#26336F",
  blue: "#5B6DF6",
  orange: "#F59E0B",
  coral: "#FF7C73",
  green: "#2E9D68",
  red: "#D84A4A",
  purple: "#7C5CE7",
  text: "#17315F",
  muted: "#7E8AA6",
  border: "#E6EBF3",
  grid: "#EEF2F7",
  surface: "#FFFFFF",
  soft: "#F8FAFD",
};

function pct(value) {
  const parsed = Number(value || 0);
  return `${Math.max(0, parsed).toFixed(1)}%`;
}

function Panel({ children, sx = {} }) {
  return (
    <Card
      sx={{
        borderRadius: "10px",
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

function Kpi({ label, value, detail, icon, color = COLORS.navy }) {
  return (
    <Panel sx={{ height: "100%" }}>
      <Box sx={{ p: 1.85 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1.2}>
          <Box minWidth={0}>
            <MDTypography variant="caption" sx={{ color: COLORS.muted, fontWeight: 650 }}>
              {label}
            </MDTypography>
            <MDTypography variant="h4" sx={{ color: COLORS.text, fontWeight: 750, mt: 0.15 }}>
              {value}
            </MDTypography>
            <MDTypography
              variant="caption"
              sx={{ color: COLORS.muted, display: "block", mt: 0.2, lineHeight: 1.35 }}
            >
              {detail}
            </MDTypography>
          </Box>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              display: "grid",
              placeItems: "center",
              backgroundColor: `${color}12`,
              color,
              flexShrink: 0,
            }}
          >
            <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "19px !important" }}>
              {icon}
            </Icon>
          </Box>
        </Stack>
      </Box>
    </Panel>
  );
}

function ProgressBar({ value, color }) {
  const bounded = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <Box sx={{ height: 7, borderRadius: 999, backgroundColor: COLORS.grid, overflow: "hidden" }}>
      <Box
        sx={{
          width: `${bounded}%`,
          minWidth: bounded > 0 ? 3 : 0,
          height: "100%",
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
    </Box>
  );
}

function FunnelStage({ label, count, total, detail, color }) {
  const share = total ? (Number(count || 0) / total) * 100 : 0;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
        <Box minWidth={0}>
          <MDTypography variant="button" sx={{ color: COLORS.text, fontWeight: 700 }}>
            {label}
          </MDTypography>
          <MDTypography
            variant="caption"
            sx={{ color: COLORS.muted, display: "block", lineHeight: 1.35 }}
          >
            {detail}
          </MDTypography>
        </Box>
        <Box textAlign="right" flexShrink={0}>
          <MDTypography variant="button" sx={{ color: COLORS.text, fontWeight: 750 }}>
            {number(count)}
          </MDTypography>
          <MDTypography variant="caption" sx={{ color: COLORS.muted, display: "block" }}>
            {pct(share)}
          </MDTypography>
        </Box>
      </Stack>
      <Box mt={0.7}>
        <ProgressBar value={share} color={color} />
      </Box>
    </Box>
  );
}

function PatternStat({ label, value, detail, color = COLORS.text }) {
  return (
    <Box
      sx={{
        p: 1.35,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "10px",
        backgroundColor: COLORS.soft,
        minWidth: 0,
      }}
    >
      <MDTypography
        variant="caption"
        sx={{ color: COLORS.muted, fontWeight: 650, display: "block" }}
      >
        {label}
      </MDTypography>
      <MDTypography variant="h6" sx={{ color, fontWeight: 750, mt: 0.2 }}>
        {value}
      </MDTypography>
      <MDTypography
        variant="caption"
        sx={{ color: COLORS.muted, display: "block", mt: 0.15, lineHeight: 1.35 }}
      >
        {detail}
      </MDTypography>
    </Box>
  );
}

function DataQuality() {
  const state = useAsyncData(getDataQuality, []);
  const data = state.data || {};
  const total = Number(data.total_leads || 0);
  const targetFit = Number(data.target_fit_leads || 0);
  const salesReady = Number(data.sales_ready_leads || 0);
  const funnel = Array.isArray(data.readiness_funnel) ? data.readiness_funnel : [];
  const scoreBands = Array.isArray(data.score_effectiveness) ? data.score_effectiveness : [];
  const legacyScoreBands = Array.isArray(data.score_bands) ? data.score_bands : [];
  const markets = Array.isArray(data.market_enrichment_priorities)
    ? data.market_enrichment_priorities
    : [];
  const fieldProfile = Array.isArray(data.field_profile) ? data.field_profile : [];
  const outcomeSample = Number(data.outcome_sample_size || 0);
  const baselineQualifiedRate = Number(data.baseline_qualified_rate_pct || 0);

  const targetFitShare = total ? (targetFit / total) * 100 : 0;
  const readyWithinTarget = targetFit ? (salesReady / targetFit) * 100 : 0;
  const multiContactCompanyShare = Number(data.distinct_companies || 0)
    ? (Number(data.multi_contact_companies || 0) / Number(data.distinct_companies || 0)) * 100
    : 0;

  const emailField = fieldProfile.find((row) => row.key === "email") || {};
  const verifiedEmailField = fieldProfile.find((row) => row.key === "verified_email") || {};
  const emailVerificationYield = Number(emailField.present || 0)
    ? (Number(verifiedEmailField.present || 0) / Number(emailField.present || 0)) * 100
    : 0;

  const lowScoreBand = legacyScoreBands.find((row) => row.label === "0–19") || {};
  const upperScoreShare = legacyScoreBands
    .filter((row) => row.label === "60–74" || row.label === "75+")
    .reduce((sum, row) => sum + Number(row.share_pct || 0), 0);

  const marketBySize = [...markets].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  const largestMarket = marketBySize[0] || {};
  const largestBacklogMarket = markets[0] || {};
  const comparableMarkets = markets.filter((row) => Number(row.target_fit || 0) >= 10);
  const bestReadyMarket =
    [...comparableMarkets].sort(
      (a, b) => Number(b.readiness_pct || 0) - Number(a.readiness_pct || 0)
    )[0] || {};

  const viableScoreBands = scoreBands.filter((row) => Number(row.contacted || 0) >= 5);
  const bestScoreBand =
    [...viableScoreBands].sort(
      (a, b) => Number(b.qualified_rate_pct || 0) - Number(a.qualified_rate_pct || 0)
    )[0] || null;
  const bestScoreLift =
    bestScoreBand && baselineQualifiedRate > 0
      ? Number(bestScoreBand.qualified_rate_pct || 0) / baselineQualifiedRate
      : null;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={{ xs: 2, sm: 3 }} sx={{ minWidth: 0, overflowX: "hidden" }}>
        <SectionHeader
          title="Marketing data intelligence"
          subtitle="Descriptive patterns that explain portfolio structure, sales readiness, market concentration and whether lead scoring is producing better commercial outcomes."
        />

        <PageState
          loading={state.loading}
          error={state.error}
          label="Building commercial data patterns…"
        >
          <>
            <Grid container spacing={1.7} mb={1.8}>
              <Grid item xs={12} sm={6} lg={3}>
                <Kpi
                  label="Target-fit leads"
                  value={number(targetFit)}
                  detail={`${pct(targetFitShare)} of the portfolio is commercially eligible`}
                  icon="filter_alt"
                  color={COLORS.navy}
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <Kpi
                  label="Sales-ready within target-fit"
                  value={pct(readyWithinTarget)}
                  detail={`${number(salesReady)} leads can be worked now`}
                  icon="rocket_launch"
                  color={COLORS.green}
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <Kpi
                  label="Target-fit backlog"
                  value={number(data.target_fit_backlog || 0)}
                  detail="Commercially relevant leads still needing enrichment"
                  icon="pending_actions"
                  color={COLORS.orange}
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <Kpi
                  label="Qualified-response baseline"
                  value={outcomeSample ? pct(baselineQualifiedRate) : "—"}
                  detail={`${number(
                    outcomeSample
                  )} contacted leads in the current validation sample`}
                  icon="insights"
                  color={COLORS.purple}
                />
              </Grid>
            </Grid>

            <Grid container spacing={1.8}>
              <Grid item xs={12} lg={5}>
                <Panel sx={{ height: "100%" }}>
                  <Box sx={{ p: 2.15 }}>
                    <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
                      Lead readiness funnel
                    </MDTypography>
                    <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                      Shows where commercially relevant records are lost before they become usable
                      for outreach.
                    </MDTypography>
                    <Stack spacing={1.45} mt={1.7}>
                      {funnel.map((row, index) => (
                        <FunnelStage
                          key={row.key || row.label}
                          label={row.label}
                          count={row.count}
                          total={total}
                          detail={row.detail}
                          color={
                            [COLORS.navy, COLORS.blue, COLORS.orange, COLORS.purple, COLORS.green][
                              index % 5
                            ]
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                </Panel>
              </Grid>

              <Grid item xs={12} lg={7}>
                <Panel sx={{ height: "100%" }}>
                  <Box sx={{ p: 2.15 }}>
                    <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
                      Descriptive commercial patterns
                    </MDTypography>
                    <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                      Compact statistics selected for interpretation, not generic field-completeness
                      reporting.
                    </MDTypography>
                    <Box
                      sx={{
                        mt: 1.45,
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(2, minmax(0,1fr))",
                          xl: "repeat(3, minmax(0,1fr))",
                        },
                        gap: 1,
                      }}
                    >
                      <PatternStat
                        label="Market concentration"
                        value={pct(data.top5_country_share_pct || 0)}
                        detail={`Top 5 markets hold this share of all leads${
                          largestMarket.country
                            ? `; ${largestMarket.country} is the largest visible market`
                            : ""
                        }.`}
                        color={
                          Number(data.top5_country_share_pct || 0) >= 70
                            ? COLORS.orange
                            : COLORS.text
                        }
                      />
                      <PatternStat
                        label="Decision-contact depth"
                        value={`${Number(data.avg_contacts_per_company || 0).toFixed(2)} / company`}
                        detail={`${pct(
                          multiContactCompanyShare
                        )} of companies have more than one stored contact.`}
                        color={COLORS.blue}
                      />
                      <PatternStat
                        label="Email verification yield"
                        value={pct(emailVerificationYield)}
                        detail={`${number(verifiedEmailField.present || 0)} of ${number(
                          emailField.present || 0
                        )} existing emails are verified/high-confidence.`}
                        color={emailVerificationYield >= 70 ? COLORS.green : COLORS.orange}
                      />
                      <PatternStat
                        label="Score concentration"
                        value={pct(lowScoreBand.share_pct || 0)}
                        detail={`Leads score 0–19; only ${pct(
                          upperScoreShare
                        )} score 60+. This exposes score skew/calibration.`}
                        color={
                          Number(lowScoreBand.share_pct || 0) >= 70 ? COLORS.red : COLORS.orange
                        }
                      />
                      <PatternStat
                        label="Largest unresolved market"
                        value={largestBacklogMarket.country || "—"}
                        detail={
                          largestBacklogMarket.country
                            ? `${number(
                                largestBacklogMarket.blocked || 0
                              )} target-fit leads are not sales-ready; readiness ${pct(
                                largestBacklogMarket.readiness_pct || 0
                              )}.`
                            : "No market backlog available."
                        }
                        color={COLORS.orange}
                      />
                      <PatternStat
                        label="Best observed market readiness"
                        value={bestReadyMarket.country || "—"}
                        detail={
                          bestReadyMarket.country
                            ? `${pct(bestReadyMarket.readiness_pct || 0)} of ${number(
                                bestReadyMarket.target_fit || 0
                              )} target-fit leads are sales-ready (markets with ≥10 target-fit leads).`
                            : "Not enough market-level observations yet."
                        }
                        color={COLORS.green}
                      />
                    </Box>
                  </Box>
                </Panel>
              </Grid>

              <Grid item xs={12}>
                <Panel>
                  <Box sx={{ p: 2.15 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Box>
                        <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
                          Does the B2B score predict commercial response?
                        </MDTypography>
                        <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                          Outcome pattern by score band. A useful score should show higher
                          qualified-response rates as the score rises.
                        </MDTypography>
                      </Box>
                      <Chip
                        size="small"
                        label={
                          bestScoreBand && bestScoreLift != null
                            ? `Best observed lift: ${bestScoreLift.toFixed(1)}× baseline (${
                                bestScoreBand.label
                              })`
                            : `${number(outcomeSample)} contacted leads — early sample`
                        }
                        sx={{
                          backgroundColor: bestScoreLift >= 1.5 ? "#EEF8F3" : "#FFF7E8",
                          color: bestScoreLift >= 1.5 ? COLORS.green : COLORS.orange,
                        }}
                      />
                    </Stack>
                    <Box sx={{ mt: 1.45, overflowX: "auto" }}>
                      <Box sx={{ minWidth: 660 }}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "105px repeat(5, minmax(90px, 1fr))",
                            gap: 1,
                            px: 1,
                            pb: 0.7,
                          }}
                        >
                          {[
                            "Score",
                            "Leads",
                            "Contacted",
                            "Human replies",
                            "Qualified",
                            "Qualified rate",
                          ].map((label) => (
                            <MDTypography
                              key={label}
                              variant="caption"
                              sx={{ color: COLORS.muted, fontWeight: 700 }}
                            >
                              {label}
                            </MDTypography>
                          ))}
                        </Box>
                        {scoreBands.map((row, index) => (
                          <Box
                            key={row.label}
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "105px repeat(5, minmax(90px, 1fr))",
                              gap: 1,
                              px: 1,
                              py: 0.9,
                              borderTop: `1px solid ${COLORS.border}`,
                              backgroundColor: index % 2 ? COLORS.soft : COLORS.surface,
                            }}
                          >
                            <MDTypography
                              variant="button"
                              sx={{ color: COLORS.text, fontWeight: 700 }}
                            >
                              {row.label}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.leads)}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.contacted)}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.replied)}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.qualified)}
                            </MDTypography>
                            <MDTypography
                              variant="button"
                              sx={{
                                color:
                                  Number(row.qualified_rate_pct || 0) > baselineQualifiedRate
                                    ? COLORS.green
                                    : COLORS.muted,
                                fontWeight: 700,
                              }}
                            >
                              {row.contacted ? pct(row.qualified_rate_pct) : "—"}
                            </MDTypography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <MDTypography
                      variant="caption"
                      sx={{ color: COLORS.muted, display: "block", mt: 1 }}
                    >
                      Baseline qualified-response rate:{" "}
                      {outcomeSample
                        ? pct(baselineQualifiedRate)
                        : "not enough contacted leads yet"}
                      . Do not interpret a score band with only a handful of contacted records as a
                      stable effect.
                    </MDTypography>
                  </Box>
                </Panel>
              </Grid>

              <Grid item xs={12}>
                <Panel>
                  <Box sx={{ p: 2.15 }}>
                    <MDTypography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>
                      Market readiness patterns
                    </MDTypography>
                    <MDTypography variant="caption" sx={{ color: COLORS.muted }}>
                      Country-level structure for deciding where enrichment has the largest
                      immediate commercial payoff.
                    </MDTypography>
                    <Box sx={{ mt: 1.35, overflowX: "auto" }}>
                      <Box sx={{ minWidth: 720 }}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1.5fr repeat(5, minmax(85px, 1fr))",
                            gap: 1,
                            px: 1,
                            pb: 0.65,
                          }}
                        >
                          {[
                            "Market",
                            "All leads",
                            "Target fit",
                            "Sales ready",
                            "Readiness",
                            "Backlog",
                          ].map((label) => (
                            <MDTypography
                              key={label}
                              variant="caption"
                              sx={{ color: COLORS.muted, fontWeight: 700 }}
                            >
                              {label}
                            </MDTypography>
                          ))}
                        </Box>
                        {markets.slice(0, 8).map((row, index) => (
                          <Box
                            key={row.country}
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "1.5fr repeat(5, minmax(85px, 1fr))",
                              gap: 1,
                              px: 1,
                              py: 0.85,
                              borderTop: `1px solid ${COLORS.border}`,
                              backgroundColor: index % 2 ? COLORS.soft : COLORS.surface,
                            }}
                          >
                            <MDTypography
                              variant="button"
                              sx={{ color: COLORS.text, fontWeight: 700 }}
                            >
                              {row.country}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.total)}
                            </MDTypography>
                            <MDTypography variant="button" sx={{ color: COLORS.text }}>
                              {number(row.target_fit)}
                            </MDTypography>
                            <MDTypography
                              variant="button"
                              sx={{ color: COLORS.green, fontWeight: 700 }}
                            >
                              {number(row.sales_ready)}
                            </MDTypography>
                            <MDTypography
                              variant="button"
                              sx={{
                                color:
                                  Number(row.readiness_pct || 0) >= readyWithinTarget
                                    ? COLORS.green
                                    : COLORS.orange,
                                fontWeight: 700,
                              }}
                            >
                              {pct(row.readiness_pct)}
                            </MDTypography>
                            <MDTypography
                              variant="button"
                              sx={{ color: COLORS.red, fontWeight: 700 }}
                            >
                              {number(row.blocked)}
                            </MDTypography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Panel>
              </Grid>
            </Grid>
          </>
        </PageState>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default DataQuality;
