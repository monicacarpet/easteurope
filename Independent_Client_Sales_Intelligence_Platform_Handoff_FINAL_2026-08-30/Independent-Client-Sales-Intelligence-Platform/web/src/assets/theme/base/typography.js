import colors from "assets/theme/base/colors";
import pxToRem from "assets/theme/functions/pxToRem";

const { dark } = colors;

const baseProperties = {
  fontFamily: '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontWeightLighter: 300,
  fontWeightLight: 400,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 600,
  fontSizeXXS: pxToRem(10),
  fontSizeXS: pxToRem(12),
  fontSizeSM: pxToRem(14),
  fontSizeMD: pxToRem(16),
  fontSizeLG: pxToRem(18),
  fontSizeXL: pxToRem(20),
  fontSize2XL: pxToRem(24),
  fontSize3XL: pxToRem(30),
};

const baseHeadingProperties = {
  fontFamily: baseProperties.fontFamily,
  color: dark.main,
  fontWeight: baseProperties.fontWeightBold,
};

const typography = {
  fontFamily: baseProperties.fontFamily,
  fontWeightLighter: baseProperties.fontWeightLighter,
  fontWeightLight: baseProperties.fontWeightLight,
  fontWeightRegular: baseProperties.fontWeightRegular,
  fontWeightMedium: baseProperties.fontWeightMedium,
  fontWeightBold: baseProperties.fontWeightBold,
  h1: { fontSize: pxToRem(38), lineHeight: 1.25, ...baseHeadingProperties },
  h2: { fontSize: pxToRem(30), lineHeight: 1.3, ...baseHeadingProperties },
  h3: { fontSize: pxToRem(24), lineHeight: 1.35, ...baseHeadingProperties },
  h4: { fontSize: pxToRem(20), lineHeight: 1.4, ...baseHeadingProperties },
  h5: { fontSize: pxToRem(16), lineHeight: 1.5, ...baseHeadingProperties },
  h6: { fontSize: pxToRem(14), lineHeight: 1.5, ...baseHeadingProperties },
  subtitle1: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(16),
    fontWeight: 500,
    lineHeight: 1.5,
  },
  subtitle2: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(14),
    fontWeight: 500,
    lineHeight: 1.5,
  },
  body1: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(14),
    fontWeight: 400,
    lineHeight: 1.6,
  },
  body2: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(13),
    fontWeight: 400,
    lineHeight: 1.55,
  },
  button: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(14),
    fontWeight: 500,
    lineHeight: 1.4,
    textTransform: "none",
  },
  caption: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(12),
    fontWeight: 400,
    lineHeight: 1.5,
  },
  overline: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(11),
    fontWeight: 600,
    lineHeight: 1.4,
    textTransform: "uppercase",
  },
  d1: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(64),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  d2: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(56),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  d3: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(48),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  d4: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(42),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  d5: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(36),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  d6: {
    fontFamily: baseProperties.fontFamily,
    fontSize: pxToRem(30),
    color: dark.main,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  size: {
    xxs: baseProperties.fontSizeXXS,
    xs: baseProperties.fontSizeXS,
    sm: baseProperties.fontSizeSM,
    md: baseProperties.fontSizeMD,
    lg: baseProperties.fontSizeLG,
    xl: baseProperties.fontSizeXL,
    "2xl": baseProperties.fontSize2XL,
    "3xl": baseProperties.fontSize3XL,
  },
  lineHeight: { sm: 1.25, md: 1.5, lg: 2 },
};

export default typography;
