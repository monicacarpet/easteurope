import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import { useMaterialUIController, setLayout } from "context";
import platformTokens from "assets/theme/platformTokens";
import {
  OPEN_WIDTH,
  MINI_WIDTH,
  CONTENT_GAP,
  CONTENT_RIGHT_GUTTER,
} from "examples/Sidenav/SidenavRoot";

const TOP_GUTTER = 10;
const BOTTOM_GUTTER = 18;

function DashboardLayout({ children }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const { pathname } = useLocation();

  useEffect(() => {
    setLayout(dispatch, "dashboard");
  }, [dispatch, pathname]);

  return (
    <MDBox
      sx={({ breakpoints, transitions }) => {
        const currentSidebarWidth = miniSidenav ? MINI_WIDTH : OPEN_WIDTH;
        const desktopLeft = currentSidebarWidth + CONTENT_GAP;
        const desktopReservedWidth = desktopLeft + CONTENT_RIGHT_GUTTER;

        return {
          minHeight: "100vh",
          width: "100%",
          position: "relative",
          boxSizing: "border-box",
          overflowX: "hidden",
          backgroundColor: platformTokens.surface.canvas,
          px: { xs: 1.5, sm: 2, xl: 0 },
          pt: { xs: 1.5, sm: 2, xl: `${TOP_GUTTER}px` },
          pb: { xs: 2, xl: `${BOTTOM_GUTTER}px` },
          transition: transitions.create(["margin-left", "width"], {
            easing: transitions.easing.easeInOut,
            duration: transitions.duration.standard,
          }),

          [breakpoints.up("xl")]: {
            marginLeft: `${desktopLeft}px`,
            width: `calc(100% - ${desktopReservedWidth}px)`,
          },
        };
      }}
    >
      {children}
    </MDBox>
  );
}

DashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default DashboardLayout;
