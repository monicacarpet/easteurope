import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

const FALLBACK_COLORS = {
  primary: "#5B6DF6",
  secondary: "#6B7280",
  info: "#3568D4",
  success: "#2E9D68",
  warning: "#D97706",
  error: "#D84A4A",
  light: "#7E8AA6",
  dark: "#26336F",
};

function renderIcon(icon) {
  if (typeof icon !== "string") return icon;
  return (
    <Icon
      baseClassName="material-icons-outlined"
      sx={{ fontSize: "19px !important", lineHeight: 1 }}
    >
      {icon}
    </Icon>
  );
}

function ComplexStatisticsCard({ color, title, count, percentage, icon }) {
  const accent = FALLBACK_COLORS[color] || FALLBACK_COLORS.dark;

  return (
    <Card
      sx={{
        height: "100%",
        minHeight: 120,
        borderRadius: "14px",
        border: "1px solid #E6EBF3",
        boxShadow: "0 6px 18px rgba(25, 45, 85, 0.05)",
        overflow: "hidden",
      }}
    >
      <MDBox px={2.15} py={1.9}>
        <MDBox display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <MDTypography
            variant="caption"
            sx={{ color: "#7E8AA6", fontSize: 11.5, fontWeight: 600, lineHeight: 1.2 }}
          >
            {title}
          </MDTypography>
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              color: accent,
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            {renderIcon(icon)}
          </Box>
        </MDBox>

        <MDTypography
          variant="h5"
          sx={{ color: "#17315F", fontWeight: 700, mt: 1, letterSpacing: "-0.025em" }}
        >
          {count}
        </MDTypography>

        <MDBox mt={0.7} display="flex" alignItems="baseline" minWidth={0}>
          {percentage.amount !== "" && percentage.amount != null ? (
            <MDTypography
              component="span"
              variant="caption"
              sx={{ color: accent, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {percentage.amount}
            </MDTypography>
          ) : null}
          <MDTypography
            component="span"
            variant="caption"
            sx={{ color: "#7E8AA6", ml: percentage.amount ? 0.55 : 0, lineHeight: 1.35 }}
          >
            {percentage.label}
          </MDTypography>
        </MDBox>
      </MDBox>
    </Card>
  );
}

ComplexStatisticsCard.defaultProps = {
  color: "info",
  percentage: {
    color: "success",
    text: "",
    label: "",
  },
};

ComplexStatisticsCard.propTypes = {
  color: PropTypes.oneOf([
    "primary",
    "secondary",
    "info",
    "success",
    "warning",
    "error",
    "light",
    "dark",
  ]),
  title: PropTypes.string.isRequired,
  count: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  percentage: PropTypes.shape({
    color: PropTypes.oneOf([
      "primary",
      "secondary",
      "info",
      "success",
      "warning",
      "error",
      "dark",
      "white",
    ]),
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
  }),
  icon: PropTypes.node.isRequired,
};

export default ComplexStatisticsCard;
