import colors from "assets/theme/base/colors";
import pxToRem from "assets/theme/functions/pxToRem";

const { grey } = colors;

const borders = {
  borderColor: grey[300],
  borderWidth: {
    0: 0,
    1: pxToRem(1),
    2: pxToRem(2),
    3: pxToRem(3),
    4: pxToRem(4),
    5: pxToRem(5),
  },
  borderRadius: {
    xs: pxToRem(2),
    sm: pxToRem(4),
    md: pxToRem(6),
    lg: pxToRem(8),
    xl: pxToRem(8),
    xxl: pxToRem(12),
    section: pxToRem(160),
  },
};

export default borders;
