import PropTypes from "prop-types";
import Chip from "@mui/material/Chip";

const GOOD = new Set([
  "available",
  "sent",
  "confirmed",
  "promotional_ready",
  "active",
  "completed",
  "verified",
  "strong_fit",
]);
const WARN = new Set([
  "claimed",
  "generated",
  "draft",
  "due",
  "stock_pressure",
  "manual_review",
  "pending",
]);
const BAD = new Set(["failed", "inactive", "overdue", "blocked", "not_set"]);

export default function StatusChip({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  let color = "default";
  if (GOOD.has(normalized)) color = "success";
  if (WARN.has(normalized)) color = "warning";
  if (BAD.has(normalized)) color = "error";
  return (
    <Chip
      size="small"
      variant="outlined"
      color={color}
      label={String(value || "Unknown").replaceAll("_", " ")}
    />
  );
}

StatusChip.propTypes = { value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) };
StatusChip.defaultProps = { value: "unknown" };
