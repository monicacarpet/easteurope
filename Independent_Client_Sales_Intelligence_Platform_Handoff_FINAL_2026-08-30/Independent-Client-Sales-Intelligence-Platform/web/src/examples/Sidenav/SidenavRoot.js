import Drawer from "@mui/material/Drawer";
import { styled } from "@mui/material/styles";
import platformTokens from "assets/theme/platformTokens";

const OPEN_WIDTH = 220;
const MINI_WIDTH = 68;
const SIDENAV_MARGIN = 0;
const CONTENT_GAP = 10;
const CONTENT_RIGHT_GUTTER = 20;

export default styled(Drawer)(({ theme, ownerState }) => {
  const { miniSidenav } = ownerState;
  const { transitions, breakpoints } = theme;
  const width = miniSidenav ? MINI_WIDTH : OPEN_WIDTH;

  return {
    width,
    flexShrink: 0,

    "& .MuiDrawer-paper": {
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      width,
      height: "100vh !important",
      maxHeight: "100vh",
      margin: "0 !important",
      top: "0 !important",
      left: "0 !important",
      bottom: "0 !important",
      overflowX: "visible",
      overflowY: "hidden",
      background: platformTokens.sidebar.background,
      color: platformTokens.sidebar.text,
      borderTop: "0 !important",
      borderBottom: "0 !important",
      borderLeft: "0 !important",
      borderRight: `1px solid ${platformTokens.sidebar.border} !important`,
      borderRadius: "0 18px 18px 0 !important",
      boxShadow: "8px 0 28px rgba(17, 24, 58, 0.08) !important",
      transition: transitions.create(["width", "transform"], {
        easing: transitions.easing.easeInOut,
        duration: transitions.duration.shorter,
      }),

      [breakpoints.down("xl")]: {
        width: OPEN_WIDTH,
        height: "calc(100vh - 24px) !important",
        maxHeight: "calc(100vh - 24px)",
        top: "12px !important",
        left: "12px !important",
        bottom: "12px !important",
        border: `1px solid ${platformTokens.sidebar.border} !important`,
        borderRadius: "18px !important",
        transform: miniSidenav ? `translateX(-${OPEN_WIDTH + 40}px)` : "translateX(0)",
        boxShadow: miniSidenav
          ? "none !important"
          : "0 16px 40px rgba(17, 24, 58, 0.18) !important",
      },
    },
  };
});

export { OPEN_WIDTH, MINI_WIDTH, SIDENAV_MARGIN, CONTENT_GAP, CONTENT_RIGHT_GUTTER };
