import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import PlatformIcon from "components/Platform/PlatformIcon";
import platformTokens from "assets/theme/platformTokens";

const ACCENTS = {
  primary: "#0F766E",
  secondary: "#8C8C8C",
  info: "#0F766E",
  success: "#52C41A",
  warning: "#FAAD14",
  error: "#FF4D4F",
  light: "#8C8C8C",
  dark: "#262626",
};

function renderIcon(icon) {
  if (typeof icon !== "string") return icon;
  return <PlatformIcon name={icon} size={19} />;
}

function ComplexStatisticsCard({ color, title, count, percentage, icon }) {
  const accent = ACCENTS[color] || ACCENTS.dark;

  return (
    <Card
      sx={{
        height: "100%",
        minHeight: 112,
        borderRadius: "14px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
        border: `1px solid ${platformTokens.surface.border}`,
        overflow: "hidden",
      }}
    >
      <MDBox px={2.1} py={1.8}>
        <MDBox display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <MDTypography
            variant="caption"
            sx={{
              color: platformTokens.text.secondary,
              fontSize: 11.5,
              fontWeight: 400,
              lineHeight: 1.2,
            }}
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
          variant="h4"
          sx={{
            color: platformTokens.text.primary,
            fontSize: 20,
            fontWeight: 600,
            mt: 1.05,
            lineHeight: 1.25,
          }}
        >
          {count}
        </MDTypography>

        <MDBox mt={0.75} display="flex" alignItems="baseline" minWidth={0}>
          {percentage.amount !== "" && percentage.amount != null ? (
            <MDTypography
              component="span"
              variant="caption"
              sx={{ color: accent, fontWeight: 500, whiteSpace: "nowrap" }}
            >
              {percentage.amount}
            </MDTypography>
          ) : null}
          <MDTypography
            component="span"
            variant="caption"
            sx={{
              color: platformTokens.text.tertiary,
              ml: percentage.amount ? 0.55 : 0,
              lineHeight: 1.35,
            }}
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
  percentage: { color: "success", text: "", label: "" },
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
