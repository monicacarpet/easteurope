import PropTypes from "prop-types";
import { Navigate, useLocation } from "react-router-dom";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import { APP_NAME } from "config/brand";
import { useAuth } from "auth/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { loading, isAuthenticated, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <MDBox minHeight="100vh" display="flex" alignItems="center" justifyContent="center">
        <MDTypography variant="h6" color="text">
          Loading {APP_NAME}…
        </MDTypography>
      </MDBox>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/authentication/sign-in" state={{ from: location }} replace />;
  }

  if (roles?.length && !roles.includes(profile?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

ProtectedRoute.defaultProps = { roles: null };
ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  roles: PropTypes.arrayOf(PropTypes.string),
};
