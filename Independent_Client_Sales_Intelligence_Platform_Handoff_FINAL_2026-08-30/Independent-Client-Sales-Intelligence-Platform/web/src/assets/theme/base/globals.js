import colors from "assets/theme/base/colors";

const { info, dark } = colors;

const globals = {
  html: {
    scrollBehavior: "smooth",
    backgroundColor: "#F8F9FA",
  },
  body: {
    margin: 0,
    backgroundColor: "#F8F9FA",
    color: "#262626",
    overflowX: "hidden",
  },
  "#root, #app": {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "#F8F9FA",
  },
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "a, a:link, a:visited": {
    textDecoration: "none !important",
  },
  "a.link, .link, a.link:link, .link:link, a.link:visited, .link:visited": {
    color: `${dark.main} !important`,
    transition: "color 150ms ease-in !important",
  },
  "a.link:hover, .link:hover, a.link:focus, .link:focus": {
    color: `${info.main} !important`,
  },
  ".MuiGrid-item, .MuiCard-root, .MuiPaper-root": {
    minWidth: 0,
    maxWidth: "100%",
  },
  ".MuiTableContainer-root": {
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
  },
  "canvas, svg": {
    maxWidth: "100%",
  },
  ".maplibregl-map": {
    maxWidth: "100%",
  },
};

export default globals;
