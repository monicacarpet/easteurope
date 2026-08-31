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
      mb={2.5}
      minWidth={0}
    >
      <MDBox minWidth={0}>
        <MDTypography
          variant="h4"
          sx={{
            color: platformTokens.text.primary,
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          {title}
        </MDTypography>
        {subtitle ? (
          <MDTypography
            variant="body2"
            sx={{ color: platformTokens.text.secondary, fontSize: 12.5, mt: 0.45, lineHeight: 1.5 }}
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
