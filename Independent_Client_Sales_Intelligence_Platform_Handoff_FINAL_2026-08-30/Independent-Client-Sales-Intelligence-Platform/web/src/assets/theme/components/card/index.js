import colors from "assets/theme/base/colors";

const { white } = colors;

const card = {
  styleOverrides: {
    root: {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      minWidth: 0,
      maxWidth: "100%",
      wordWrap: "break-word",
      backgroundColor: white.main,
      backgroundClip: "border-box",
      border: "1px solid #DDE5E8",
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
      overflow: "hidden",
    },
  },
};

export default card;
