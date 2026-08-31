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
      border: "1px solid #E6EBF1",
      borderRadius: 8,
      boxShadow: "none",
      overflow: "hidden",
    },
  },
};

export default card;
