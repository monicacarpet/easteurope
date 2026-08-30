import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import { date, number, percent, relativeDate } from "lib/format";
import platformTokens from "assets/theme/platformTokens";

function ProgressMetric({ label, value, display, color }) {
  return (
    <Box sx={{ mb: 1.65 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
        <Typography
          variant="caption"
          sx={{ color: platformTokens.text.secondary, fontSize: "0.67rem", fontWeight: 600 }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: platformTokens.text.primary, fontSize: "0.68rem", fontWeight: 700 }}
        >
          {display}
        </Typography>
      </Box>
      <Box
        sx={{
          mt: 0.65,
          width: "100%",
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "#EEF1F6",
        }}
      >
        <Box
          sx={{
            width: `${Math.max(3, Math.min(100, value))}%`,
            height: "100%",
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      </Box>
    </Box>
  );
}

ProgressMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  display: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
};

function FunnelMetric({ label, value, accent }) {
  return (
    <Box
      sx={{
        py: 1,
        px: 1,
        borderRadius: "9px",
        border: `1px solid ${platformTokens.surface.border}`,
        backgroundColor: platformTokens.surface.cardMuted,
      }}
    >
      <Typography sx={{ color: accent, fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.1 }}>
        {number(value)}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: platformTokens.text.tertiary, fontSize: "0.58rem" }}
      >
        {label}
      </Typography>
    </Box>
  );
}

FunnelMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  accent: PropTypes.string.isRequired,
};

export default function OperationsOverview({ stock }) {
  const current = stock.current || {};
  const eligibility = Number(current.total_area_m2)
    ? (Number(current.promotional_area_m2) / Number(current.total_area_m2)) * 100
    : 0;
  const priceCoverage = stock.items.length ? (stock.priceConfirmed / stock.items.length) * 100 : 0;
  const funnel = stock.funnel || {};

  return (
    <Card
      sx={{
        height: "100%",
        border: `1px solid ${platformTokens.surface.border}`,
        borderRadius: "16px",
        boxShadow: "0 3px 14px rgba(16, 24, 40, 0.035)",
      }}
    >
      <Box sx={{ px: 2.25, pt: 2.1, pb: 2.1 }}>
        <Typography
          sx={{ color: platformTokens.text.primary, fontWeight: 700, fontSize: "0.9rem" }}
        >
          Operations overview
        </Typography>
        <Typography
          variant="caption"
          sx={{
            mt: 0.35,
            display: "block",
            color: platformTokens.text.tertiary,
            fontSize: "0.69rem",
          }}
        >
          Active inventory · {date(current.effective_date)}
        </Typography>

        <Box sx={{ mt: 2 }}>
          <ProgressMetric
            label="Promotion-ready stock"
            value={eligibility}
            display={percent(eligibility)}
            color={platformTokens.chart.primary}
          />
          <ProgressMetric
            label="Pricing readiness"
            value={priceCoverage}
            display={percent(priceCoverage)}
            color={platformTokens.chart.secondary}
          />
        </Box>

        <Box
          sx={{
            mt: 2,
            pt: 1.65,
            borderTop: `1px solid ${platformTokens.surface.border}`,
          }}
        >
          <Box display="flex" justifyContent="space-between" gap={2} sx={{ mb: 1.15 }}>
            <Typography
              variant="caption"
              sx={{ color: platformTokens.text.secondary, fontSize: "0.66rem", fontWeight: 700 }}
            >
              Campaign funnel
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: platformTokens.text.tertiary, fontSize: "0.61rem" }}
            >
              {relativeDate(stock.lastEmailAt)}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 0.75,
            }}
          >
            <FunnelMetric
              label="Sent"
              value={Number(funnel.sent || 0)}
              accent={platformTokens.chart.primary}
            />
            <FunnelMetric
              label="Interest"
              value={Number(funnel.interested || 0)}
              accent={platformTokens.status.success}
            />
            <FunnelMetric
              label="Quoted"
              value={Number(funnel.quoted || 0)}
              accent={platformTokens.status.warning}
            />
            <FunnelMetric
              label="Sold"
              value={Number(funnel.sold || 0)}
              accent={platformTokens.status.danger}
            />
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1.65,
            pt: 1.65,
            borderTop: `1px solid ${platformTokens.surface.border}`,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1.5,
          }}
        >
          <Box>
            <Typography
              sx={{ color: platformTokens.text.primary, fontSize: "0.8rem", fontWeight: 700 }}
            >
              {number(current.row_count || stock.items.length)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: platformTokens.text.tertiary, fontSize: "0.6rem" }}
            >
              active lots
            </Typography>
          </Box>
          <Box>
            <Typography
              sx={{ color: platformTokens.text.primary, fontSize: "0.8rem", fontWeight: 700 }}
            >
              {number(stock.countriesReached)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: platformTokens.text.tertiary, fontSize: "0.6rem" }}
            >
              countries reached
            </Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

OperationsOverview.propTypes = {
  stock: PropTypes.objectOf(PropTypes.any).isRequired,
};
