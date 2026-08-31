import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import MDBox from "components/MDBox";
import { useMaterialUIController, setLayout } from "context";
import platformTokens from "assets/theme/platformTokens";
import { WORKSPACE_MAX_WIDTH, WORKSPACE_SHELL_HEIGHT } from "config/workspaceLayout";

function DashboardLayout({ children }) {
  const [, dispatch] = useMaterialUIController();
  const { pathname } = useLocation();

  useEffect(() => {
    setLayout(dispatch, "dashboard");
  }, [dispatch, pathname]);

  return (
    <MDBox
      component="main"
      sx={{
        minHeight: "100vh",
        minWidth: 0,
        width: "100%",
        m: 0,
        pt: `${WORKSPACE_SHELL_HEIGHT}px`,
        position: "relative",
        overflowX: "hidden",
        boxSizing: "border-box",
        backgroundColor: platformTokens.surface.canvas,
      }}
    >
      <Box
        data-testid="workspace-content-frame"
        sx={{
          width: "100%",
          maxWidth: `${WORKSPACE_MAX_WIDTH}px`,
          mx: "auto",
          px: { xs: 2, sm: 3, lg: 4.5 },
          pb: { xs: 2, sm: 3 },
          minWidth: 0,
          boxSizing: "border-box",
          "& > *": { minWidth: 0, maxWidth: "100%" },
          "& .MuiTableContainer-root": { maxWidth: "100%", overflowX: "auto" },
          "& .maplibregl-map": { maxWidth: "100%" },
        }}
      >
        {children}
      </Box>
    </MDBox>
  );
}

DashboardLayout.propTypes = { children: PropTypes.node.isRequired };

export { WORKSPACE_SHELL_HEIGHT };
export default DashboardLayout;
