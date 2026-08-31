import Drawer from "@mui/material/Drawer";
import { styled } from "@mui/material/styles";
import platformTokens from "assets/theme/platformTokens";

const OPEN_WIDTH = 260;
const MINI_WIDTH = 72;

export default styled(Drawer)(({ theme, ownerState }) => {
  const { miniSidenav } = ownerState;
  const { transitions, breakpoints } = theme;
  const desktopWidth = miniSidenav ? MINI_WIDTH : OPEN_WIDTH;

  return {
    width: desktopWidth,
    flexShrink: 0,

    "& .MuiDrawer-paper": {
      width: desktopWidth,
      height: "100vh",
      top: 0,
      left: 0,
      bottom: 0,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      overflowX: "hidden",
      overflowY: "hidden",
      backgroundColor: platformTokens.sidebar.background,
      color: platformTokens.sidebar.text,
      borderRight: `1px solid ${platformTokens.sidebar.border}`,
      borderRadius: 0,
      boxShadow: "none",
      transition: transitions.create(["width", "transform"], {
        easing: transitions.easing.sharp,
        duration: transitions.duration.shorter,
      }),

      [breakpoints.down("xl")]: {
        width: OPEN_WIDTH,
        transform: miniSidenav ? `translateX(-${OPEN_WIDTH}px)` : "translateX(0)",
        boxShadow: miniSidenav ? "none" : "0 8px 24px rgba(0,0,0,0.12)",
        zIndex: 1300,
      },
    },
  };
});

export { OPEN_WIDTH, MINI_WIDTH };
