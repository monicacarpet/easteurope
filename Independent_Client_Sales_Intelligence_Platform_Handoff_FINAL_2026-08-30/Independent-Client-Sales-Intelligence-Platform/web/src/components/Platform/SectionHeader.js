import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import platformTokens from "assets/theme/platformTokens";

export default function SectionHeader({ title, subtitle, action }) {
  return (
    <MDBox
      display="flex"
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", md: "center" }}
      flexDirection={{ xs: "column", md: "row" }}
      gap={1.5}
      mb={3}
      minWidth={0}
    >
      <MDBox minWidth={0}>
        <MDTypography
          variant="h4"
          sx={{
            color: platformTokens.text.primary,
            fontSize: { xs: 21, md: 24 },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.025em",
          }}
        >
          {title}
        </MDTypography>
        {subtitle ? (
          <MDTypography
            variant="body2"
            sx={{ color: platformTokens.text.secondary, fontSize: 13, mt: 0.55, lineHeight: 1.55 }}
          >
            {subtitle}
          </MDTypography>
        ) : null}
      </MDBox>
      {action ? <MDBox sx={{ flexShrink: 0, maxWidth: "100%" }}>{action}</MDBox> : null}
    </MDBox>
  );
}

SectionHeader.defaultProps = { subtitle: "", action: null };
SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  action: PropTypes.node,
};
