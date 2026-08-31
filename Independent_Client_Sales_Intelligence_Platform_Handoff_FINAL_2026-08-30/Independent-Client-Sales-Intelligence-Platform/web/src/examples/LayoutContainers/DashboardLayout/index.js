import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import { useMaterialUIController, setLayout } from "context";
import platformTokens from "assets/theme/platformTokens";
import { OPEN_WIDTH, MINI_WIDTH } from "examples/Sidenav/SidenavRoot";

const HEADER_HEIGHT = 64;

function DashboardLayout({ children }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const { pathname } = useLocation();

  useEffect(() => {
    setLayout(dispatch, "dashboard");
  }, [dispatch, pathname]);

  return (
    <MDBox
      component="main"
      sx={({ breakpoints, transitions }) => {
        const sidebarWidth = miniSidenav ? MINI_WIDTH : OPEN_WIDTH;

        return {
          minHeight: "100vh",
          minWidth: 0,
          width: "100%",
          marginLeft: 0,
          pt: `${HEADER_HEIGHT}px`,
          px: { xs: 2, sm: 2.5, md: 3 },
          pb: 2.5,
          position: "relative",
          overflowX: "hidden",
          boxSizing: "border-box",
          backgroundColor: platformTokens.surface.canvas,
          transition: transitions.create(["margin-left", "width"], {
            easing: transitions.easing.sharp,
            duration: transitions.duration.shorter,
          }),

          "& > *": {
            minWidth: 0,
            maxWidth: "100%",
          },

          [breakpoints.up("xl")]: {
            marginLeft: `${sidebarWidth}px`,
            width: `calc(100% - ${sidebarWidth}px)`,
          },
        };
      }}
    >
      {children}
    </MDBox>
  );
}

DashboardLayout.propTypes = { children: PropTypes.node.isRequired };

export { HEADER_HEIGHT };
export default DashboardLayout;
