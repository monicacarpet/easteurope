export const APP_NAME = process.env.REACT_APP_NAME || "Sales Intelligence";
export const BRAND_SHORT_NAME = process.env.REACT_APP_BRAND_SHORT_NAME || "Sales Intelligence";
export const COMPANY_NAME = process.env.REACT_APP_COMPANY_NAME || "Client Company";
export const COMPANY_WEBSITE = process.env.REACT_APP_COMPANY_WEBSITE || "https://example.com";
export const SUPPORT_EMAIL = process.env.REACT_APP_SUPPORT_EMAIL || "support@example.com";

const parsedOffset = Number(process.env.REACT_APP_BUSINESS_UTC_OFFSET_HOURS || 0);
export const BUSINESS_UTC_OFFSET_HOURS = Number.isFinite(parsedOffset) ? parsedOffset : 0;
