import PropTypes from "prop-types";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

export default function PageState({ loading, error, children, label }) {
  if (loading) {
    return (
      <Card>
        <MDBox
          minHeight="18rem"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={2}
        >
          <CircularProgress color="info" />
          <MDTypography variant="button" color="text">
            {label}
          </MDTypography>
        </MDBox>
      </Card>
    );
  }

  if (error) {
    return <Alert severity="error">{error.message || String(error)}</Alert>;
  }

  return children;
}

PageState.defaultProps = { error: null, label: "Loading data…" };
PageState.propTypes = {
  loading: PropTypes.bool.isRequired,
  error: PropTypes.instanceOf(Error),
  children: PropTypes.node.isRequired,
  label: PropTypes.string,
};
