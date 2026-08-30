import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import { COMPANY_NAME } from "config/brand";
export default function Footer({ light }) {
  return (
    <MDBox position="absolute" width="100%" bottom={0} py={3} textAlign="center">
      <MDTypography variant="caption" color={light ? "white" : "text"}>
        © {new Date().getFullYear()} {COMPANY_NAME} · Authorized internal users only
      </MDTypography>
    </MDBox>
  );
}
Footer.defaultProps = { light: false };
Footer.propTypes = { light: PropTypes.bool };
