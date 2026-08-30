import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

export default function SectionHeader({ title, subtitle, action }) {
  return (
    <MDBox
      display="flex"
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", md: "center" }}
      flexDirection={{ xs: "column", md: "row" }}
      gap={1.5}
      mb={3}
    >
      <MDBox>
        <MDTypography variant="h4" fontWeight="medium">
          {title}
        </MDTypography>
        <MDTypography variant="button" color="text" fontWeight="regular">
          {subtitle}
        </MDTypography>
      </MDBox>
      {action ? <MDBox>{action}</MDBox> : null}
    </MDBox>
  );
}

SectionHeader.defaultProps = { subtitle: "", action: null };
SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  action: PropTypes.node,
};
