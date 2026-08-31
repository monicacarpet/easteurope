/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import PageState from "components/Platform/PageState";
import useAsyncData from "hooks/useAsyncData";
import useSessionState from "hooks/useSessionState";
import {
  cancelManualLeadOutreach,
  cancelManualStockPromotion,
  getCampaignWorkspace,
  queueManualLeadOutreach,
  queueManualStockPromotion,
  saveCampaignControl,
  setManualQueueTimingOverride,
} from "services/api";
import { dateTime, number } from "lib/format";
import { useAuth } from "auth/AuthContext";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const TOKENS = {
  navy: "#17234f",
  orange: "#f59e0b",
  text: "#1f3155",
  muted: "#7b879f",
  border: "#e3e8f0",
  soft: "#f7f9fc",
  green: "#24845e",
  red: "#c84747",
};

function dateLabel(value) {
  if (!value) return "No date limit";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function controlStatus(control) {
  if (!control?.enabled) return { text: "Paused", color: TOKENS.red };
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  if (control.start_date && today < control.start_date)
    return { text: "Scheduled", color: TOKENS.orange };
  if (control.end_date && today > control.end_date) return { text: "Ended", color: TOKENS.red };
  return { text: "Active", color: TOKENS.green };
}

function AgentControl({ control, countries, analytics, canEdit, onSaved }) {
  const [draft, setDraft] = useState(control);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const status = controlStatus(draft);

  useEffect(() => setDraft(control), [control]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveCampaignControl(control.control_key, draft);
      setDraft(saved);
      setMessage(
        control.control_key === "stock_promotion"
          ? "Saved. The stock workflow will use these controls on its next eligible run; the current live-inventory safety gate still applies."
          : "Saved. The next lead-outreach run will use these controls."
      );
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  const targets = draft.target_countries || [];
  const priorities = draft.priority_countries || [];
  const isStock = draft.control_key === "stock_promotion";
  const isLeadOutreach = draft.control_key === "lead_outreach";

  return (
    <Box
      sx={{
        backgroundColor: "#fff",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: "12px",
        p: { xs: 2.2, md: 3 },
      }}
    >
      <Grid container spacing={2.2} alignItems="flex-start">
        <Grid item xs={12} lg={3}>
          <Box>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
                {draft.display_name}
              </Typography>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: status.color,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                {status.text}
              </Typography>
            </Box>
            <Typography
              sx={{ mt: 0.65, fontSize: 12, color: TOKENS.muted, overflowWrap: "anywhere" }}
            >
              {draft.sender_email}
            </Typography>
            <Typography sx={{ mt: 1.2, fontSize: 11.5, color: TOKENS.muted }}>
              {isStock
                ? "Stock mailbox. Live scheduled sending is still separately protected until detailed SKU inventory is current."
                : "Primary lead-outreach mailbox. Existing qualification, cooldown and recipient-local-time guards remain active."}
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Box display="grid" gap={1.4}>
            <Autocomplete
              multiple
              options={countries}
              value={targets}
              onChange={(_event, values) =>
                setDraft((current) => ({ ...current, target_countries: values }))
              }
              disabled={!canEdit}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option}
                    label={option}
                    size="small"
                    sx={{ borderRadius: "5px", height: 24 }}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Target countries"
                  placeholder={targets.length ? "Add another country" : "All eligible countries"}
                  helperText={
                    targets.length
                      ? `${targets.length} selected`
                      : "Empty means all eligible countries"
                  }
                />
              )}
            />
            {isLeadOutreach ? (
              <Autocomplete
                multiple
                filterSelectedOptions
                options={countries}
                value={priorities}
                onChange={(_event, values) =>
                  setDraft((current) => ({ ...current, priority_countries: values }))
                }
                disabled={!canEdit}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={option}
                      label={`${index + 1}. ${option}`}
                      size="small"
                      sx={{ borderRadius: "5px", height: 24 }}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    label="Manual Reach country priority"
                    placeholder={
                      priorities.length ? "Add next priority country" : "No country priority"
                    }
                    helperText={
                      priorities.length
                        ? "Selection order sets priority; first selected ranks highest."
                        : "Empty means Manual Reach ranks purely by lead quality."
                    }
                  />
                )}
              />
            ) : null}
            <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "1fr 1fr" }} gap={1.2}>
              <TextField
                size="small"
                type="date"
                label="Start date"
                InputLabelProps={{ shrink: true }}
                value={draft.start_date || ""}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, start_date: event.target.value || null }))
                }
              />
              <TextField
                size="small"
                type="date"
                label="End date"
                InputLabelProps={{ shrink: true }}
                value={draft.end_date || ""}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, end_date: event.target.value || null }))
                }
              />
            </Box>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={1}
              flexWrap="wrap"
            >
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={Boolean(draft.enabled)}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12.5, color: TOKENS.text }}>Agent enabled</Typography>
                }
              />
              {canEdit ? (
                <Button
                  size="small"
                  variant="contained"
                  disableElevation
                  onClick={save}
                  disabled={saving}
                  sx={{
                    backgroundColor: TOKENS.navy,
                    borderRadius: "6px",
                    textTransform: "none",
                    px: 2,
                  }}
                >
                  {saving ? "Saving…" : "Save controls"}
                </Button>
              ) : null}
            </Box>
            {message ? (
              <Alert
                severity={message.toLowerCase().includes("saved") ? "success" : "error"}
                sx={{ py: 0.2, "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
                onClose={() => setMessage("")}
              >
                {message}
              </Alert>
            ) : null}
          </Box>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0,1fr))",
              borderLeft: { lg: `1px solid ${TOKENS.border}` },
              pl: { lg: 2.2 },
              gap: "14px 18px",
            }}
          >
            {[
              ["Sent this month", number(analytics?.sentThisMonth || 0)],
              ["Unique leads reached", number(analytics?.uniqueReachedThisMonth || 0)],
              ["Countries reached", number(analytics?.countriesReachedThisMonth || 0)],
              ["Failed", number(analytics?.failedThisMonth || 0)],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography sx={{ fontSize: 10.5, color: TOKENS.muted }}>{label}</Typography>
                <Typography sx={{ mt: 0.2, fontSize: 20, fontWeight: 700, color: TOKENS.text }}>
                  {value}
                </Typography>
              </Box>
            ))}
            <Box sx={{ gridColumn: "1 / -1", pt: 0.4 }}>
              <Typography sx={{ fontSize: 10.5, color: TOKENS.muted }}>Window</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: TOKENS.text }}>
                {dateLabel(draft.start_date)} → {dateLabel(draft.end_date)}
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: 10.5, color: TOKENS.muted }}>
                Last send:{" "}
                {analytics?.latestSend ? dateTime(analytics.latestSend) : "No recorded send"}
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

function preferredEmail(lead) {
  return lead?.personal_email || lead?.secondary_contact_email || lead?.email || "";
}

function preferredPhone(lead) {
  return lead?.direct_phone || lead?.mobile_phone || lead?.whatsapp_phone || lead?.phone || "";
}

function ManualLeadOutreachPanel({ leads, queue, priorityCountries, canEdit, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [forceLocalWindow, setForceLocalWindow] = useSessionState(
    "platform-campaigns:lead-force-local-window",
    false
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const activeQueue = (queue || []).filter(
    (row) =>
      row?.campaign_key === "lead_outreach" &&
      ["queued", "processing"].includes(String(row?.status || "").toLowerCase())
  );

  async function queueLead() {
    if (!selected?.lead_id) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await queueManualLeadOutreach(selected.lead_id, forceLocalWindow);
      setMessage(
        result?.already_queued
          ? "This lead is already queued for the outreach agent."
          : "Selected lead queued. The lead-outreach agent will process this exact lead before automatic candidates."
      );
      setSelected(null);
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not queue this lead for lead outreach.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(row) {
    setBusy(true);
    setMessage("");
    try {
      await cancelManualLeadOutreach(row.id);
      setMessage("Queued manual lead-outreach send cancelled.");
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not cancel this queued lead.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTiming(row, force) {
    setBusy(true);
    setMessage("");
    try {
      await setManualQueueTimingOverride(row.id, force);
      setMessage(
        force
          ? "Timing override saved for this queued lead."
          : "This queued lead will now wait for the recipient's local business window."
      );
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not update this queued lead's timing override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        mt: 2.5,
        backgroundColor: "#fff",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: "12px",
        p: { xs: 2.2, md: 3 },
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
        gap={2}
        flexWrap="wrap"
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
            Manual lead outreach
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11.5, color: TOKENS.muted, maxWidth: 760 }}>
            {priorityCountries?.length
              ? `Country priority: ${priorityCountries.join(
                  " → "
                )}. Only named decision-makers with a direct email or phone are listed.`
              : "No country priority is configured. Named decision-makers with a direct email or phone are ranked by lead quality."}
            {
              " Email sends still keep the existing DNC, cooldown, website, email/MX and daily-limit safeguards."
            }
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${activeQueue.length} active`}
          sx={{ fontSize: 10.5, fontWeight: 700 }}
        />
      </Box>

      <Grid container spacing={2} sx={{ mt: 0.8 }} alignItems="center">
        <Grid item xs={12}>
          <Autocomplete
            options={leads || []}
            value={selected}
            onChange={(_event, value) => setSelected(value)}
            disabled={!canEdit || busy}
            getOptionLabel={(row) => {
              const contact =
                row?.contact_full_name || row?.secondary_contact_full_name || "No named contact";
              const email = preferredEmail(row) || "No email";
              const phone = preferredPhone(row) || "No phone";
              const score = Number(row?.b2b_score || 0);
              return `${row?.country || ""} — ${
                row?.name || row?.lead_id
              } — ${contact} — ${email} — ${phone} — score ${score}`;
            }}
            isOptionEqualToValue={(option, value) => option?.lead_id === value?.lead_id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Select lead manually"
                placeholder="Search company, contact or email"
              />
            )}
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={forceLocalWindow}
                disabled={!canEdit || busy}
                onChange={(event) => setForceLocalWindow(event.target.checked)}
              />
            }
            label={
              <Typography sx={{ fontSize: 11.5, color: TOKENS.text }}>
                For the next newly queued lead: bypass recipient-local business hours
              </Typography>
            }
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Button
            fullWidth
            variant="contained"
            disableElevation
            disabled={!canEdit || busy || !selected?.lead_id || !preferredEmail(selected)}
            onClick={queueLead}
            sx={{
              backgroundColor: TOKENS.navy,
              color: "#fff",
              textTransform: "none",
              borderRadius: "8px",
              minHeight: 42,
            }}
          >
            {busy ? "Queuing…" : "Queue agent send"}
          </Button>
        </Grid>
      </Grid>

      {selected ? (
        <Box sx={{ mt: 1.3, px: 1.1, py: 0.9, backgroundColor: TOKENS.soft, borderRadius: "6px" }}>
          <Typography sx={{ fontSize: 11.5, color: TOKENS.text }}>
            <b>Recipient:</b> {preferredEmail(selected) || "No email"} · <b>Phone:</b>{" "}
            {preferredPhone(selected) || "No phone"} · <b>Contact:</b>{" "}
            {selected.contact_full_name || selected.secondary_contact_full_name || "Not named"}
          </Typography>
        </Box>
      ) : null}

      {message ? (
        <Alert
          severity={message.toLowerCase().includes("could not") ? "error" : "success"}
          sx={{ mt: 1.5, py: 0.2 }}
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      ) : null}

      {activeQueue.length ? (
        <Box sx={{ mt: 1.7, borderTop: `1px solid ${TOKENS.border}` }}>
          {activeQueue.map((row) => (
            <Box
              key={row.id}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              gap={1.5}
              sx={{ py: 1, borderBottom: `1px solid ${TOKENS.border}` }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: TOKENS.text,
                    overflowWrap: "anywhere",
                  }}
                >
                  {row?.lead?.name || row.lead_id}
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: TOKENS.muted }}>
                  {String(row.status || "queued").toUpperCase()} ·{" "}
                  {row.force_local_window ? "immediate window override" : "local business hours"} ·{" "}
                  {dateTime(row.requested_at)}
                </Typography>
                {row.error_message ? (
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize: 10.3,
                      color: TOKENS.orange,
                      overflowWrap: "anywhere",
                    }}
                  >
                    Pending reason: {row.error_message}
                  </Typography>
                ) : null}
              </Box>
              {canEdit && String(row.status || "").toLowerCase() === "queued" ? (
                <Box display="flex" alignItems="center" gap={0.8} flexShrink={0}>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(row.force_local_window)}
                        disabled={busy}
                        onChange={(event) => updateTiming(row, event.target.checked)}
                      />
                    }
                    label={<Typography sx={{ fontSize: 10.5 }}>Bypass timing</Typography>}
                  />
                  <Button
                    size="small"
                    onClick={() => cancel(row)}
                    disabled={busy}
                    sx={{ textTransform: "none", color: TOKENS.red }}
                  >
                    Cancel
                  </Button>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function ManualPromotionPanel({ leads, queue, canEdit, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [forceLocalWindow, setForceLocalWindow] = useSessionState(
    "platform-campaigns:stock-force-local-window",
    false
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const activeQueue = (queue || []).filter(
    (row) =>
      row?.campaign_key === "stock_promotion" &&
      ["queued", "processing"].includes(String(row?.status || "").toLowerCase())
  );

  async function queueLead() {
    if (!selected?.lead_id) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await queueManualStockPromotion(selected.lead_id, forceLocalWindow);
      setMessage(
        result?.already_queued
          ? "This lead is already queued for the stock agent."
          : "Selected lead queued. The stock agent will process this exact lead before automatic candidates."
      );
      setSelected(null);
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not queue this lead.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(row) {
    setBusy(true);
    setMessage("");
    try {
      await cancelManualStockPromotion(row.id);
      setMessage("Queued manual send cancelled.");
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not cancel this queued lead.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTiming(row, force) {
    setBusy(true);
    setMessage("");
    try {
      await setManualQueueTimingOverride(row.id, force);
      setMessage(
        force
          ? "Timing override saved for this queued stock lead."
          : "This queued stock lead will now wait for the recipient's local business window."
      );
      onChanged();
    } catch (error) {
      setMessage(error.message || "Could not update this queued stock lead's timing override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        mt: 2.5,
        backgroundColor: "#fff",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: "12px",
        p: { xs: 2.2, md: 3 },
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
        gap={2}
        flexWrap="wrap"
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
            Manual stock promotion
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11.5, color: TOKENS.muted, maxWidth: 760 }}>
            Select one exact lead and queue it for the stock-promotion agent. The selected lead is
            processed before automatic candidates; do-not-contact, cooldown, website, email/MX and
            daily-limit safeguards still apply.
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${activeQueue.length} active`}
          sx={{ fontSize: 10.5, fontWeight: 700 }}
        />
      </Box>

      <Grid container spacing={2} sx={{ mt: 0.8 }} alignItems="center">
        <Grid item xs={12}>
          <Autocomplete
            options={leads || []}
            value={selected}
            onChange={(_event, value) => setSelected(value)}
            disabled={!canEdit || busy}
            getOptionLabel={(row) => {
              const contact =
                row?.contact_full_name || row?.secondary_contact_full_name || "No named contact";
              const email = preferredEmail(row) || "No email";
              const score = Number(row?.b2b_score || 0);
              return `${row?.country || ""} — ${
                row?.name || row?.lead_id
              } — ${contact} — ${email} — score ${score}`;
            }}
            isOptionEqualToValue={(option, value) => option?.lead_id === value?.lead_id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Select lead manually"
                placeholder="Search company, contact or email"
              />
            )}
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={forceLocalWindow}
                disabled={!canEdit || busy}
                onChange={(event) => setForceLocalWindow(event.target.checked)}
              />
            }
            label={
              <Typography sx={{ fontSize: 11.5, color: TOKENS.text }}>
                For the next newly queued lead: bypass recipient-local business hours
              </Typography>
            }
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Button
            fullWidth
            variant="contained"
            disableElevation
            disabled={!canEdit || busy || !selected?.lead_id}
            onClick={queueLead}
            sx={{
              backgroundColor: TOKENS.orange,
              color: "#fff",
              textTransform: "none",
              borderRadius: "8px",
              minHeight: 42,
            }}
          >
            {busy ? "Queuing…" : "Queue agent send"}
          </Button>
        </Grid>
      </Grid>

      {selected ? (
        <Box sx={{ mt: 1.5, px: 1.4, py: 1.1, backgroundColor: TOKENS.soft, borderRadius: "8px" }}>
          <Typography sx={{ fontSize: 11.5, color: TOKENS.text, overflowWrap: "anywhere" }}>
            <b>Recipient:</b> {preferredEmail(selected) || "No email"} · <b>Contact:</b>{" "}
            {selected.contact_full_name || selected.secondary_contact_full_name || "Not named"} ·{" "}
            <b>Market:</b> {selected.country || "Unknown"}
          </Typography>
        </Box>
      ) : null}

      {message ? (
        <Alert
          severity={message.toLowerCase().includes("could not") ? "error" : "success"}
          sx={{ mt: 1.5, py: 0.2 }}
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      ) : null}

      {activeQueue.length ? (
        <Box sx={{ mt: 1.7, borderTop: `1px solid ${TOKENS.border}` }}>
          {activeQueue.map((row) => (
            <Box
              key={row.id}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              gap={1.5}
              sx={{ py: 1, borderBottom: `1px solid ${TOKENS.border}` }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: TOKENS.text,
                    overflowWrap: "anywhere",
                  }}
                >
                  {row?.lead?.name || row.lead_id}
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: TOKENS.muted }}>
                  {String(row.status || "queued").toUpperCase()} ·{" "}
                  {row.force_local_window ? "immediate window override" : "local business hours"} ·{" "}
                  {dateTime(row.requested_at)}
                </Typography>
                {row.error_message ? (
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize: 10.3,
                      color: TOKENS.orange,
                      overflowWrap: "anywhere",
                    }}
                  >
                    Pending reason: {row.error_message}
                  </Typography>
                ) : null}
              </Box>
              {canEdit && String(row.status || "").toLowerCase() === "queued" ? (
                <Box display="flex" alignItems="center" gap={0.8} flexShrink={0}>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(row.force_local_window)}
                        disabled={busy}
                        onChange={(event) => updateTiming(row, event.target.checked)}
                      />
                    }
                    label={<Typography sx={{ fontSize: 10.5 }}>Bypass timing</Typography>}
                  />
                  <Button
                    size="small"
                    onClick={() => cancel(row)}
                    disabled={busy}
                    sx={{ textTransform: "none", color: TOKENS.red }}
                  >
                    Cancel
                  </Button>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function ReachChart({ reach }) {
  const rows = (reach?.daily || []).slice(-30);
  const data = {
    labels: rows.map((row) => String(row.date || "").slice(5)),
    datasets: [
      {
        label: "Lead outreach",
        data: rows.map((row) => Number(row.lead_reach || 0)),
        borderColor: TOKENS.navy,
        backgroundColor: "transparent",
        pointRadius: 1.5,
        borderWidth: 2,
        tension: 0.28,
      },
      {
        label: "Stock promotion",
        data: rows.map((row) => Number(row.stock_reach || 0)),
        borderColor: TOKENS.orange,
        backgroundColor: "transparent",
        pointRadius: 1.5,
        borderWidth: 2,
        tension: 0.28,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", align: "end", labels: { boxWidth: 9, usePointStyle: true } },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: TOKENS.muted,
          autoSkip: false,
          maxRotation: 0,
          callback(value, index, ticks) {
            const isLast = index === ticks.length - 1;
            const step = Math.max(1, Math.ceil((ticks.length - 1) / 6));
            if (!isLast && index % step !== 0) return "";
            return this.getLabelForValue(value);
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: "#edf1f6" },
        border: { display: false },
        ticks: { precision: 0, color: TOKENS.muted },
      },
    },
  };
  return (
    <Box sx={{ height: 260 }}>
      <Line data={data} options={options} />
    </Box>
  );
}

export default function Campaigns() {
  const state = useAsyncData(getCampaignWorkspace, [], { cacheKey: "campaign-workspace" });
  const { isAdmin } = useAuth();
  const data = state.data;
  const controls = useMemo(() => data?.controls || [], [data]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <Box sx={{ py: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <PageState loading={state.loading} error={state.error} label="Loading campaign controls…">
          {data ? (
            <>
              <Box sx={{ mb: 3 }}>
                <Typography
                  sx={{
                    fontSize: 25,
                    fontWeight: 700,
                    color: TOKENS.text,
                    letterSpacing: "-.02em",
                  }}
                >
                  Campaign control
                </Typography>
                <Typography sx={{ mt: 0.45, fontSize: 13, color: TOKENS.muted }}>
                  Country focus and active dates for both production mailboxes. Permanent delivery
                  and cooldown safeguards still apply.
                </Typography>
              </Box>

              {!isAdmin ? (
                <Alert
                  severity="info"
                  sx={{ mb: 2, "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
                >
                  You can view campaign controls. Only CEO, Business GM and BI Admin roles can
                  change them.
                </Alert>
              ) : null}

              <Box sx={{ display: "grid", gap: 2.5 }}>
                {controls.map((control) => (
                  <AgentControl
                    key={control.control_key}
                    control={control}
                    countries={data.countries || []}
                    analytics={data.analytics?.[control.control_key]}
                    canEdit={isAdmin}
                    onSaved={() => state.refresh({ showLoading: false })}
                  />
                ))}
              </Box>

              <ManualLeadOutreachPanel
                leads={data.manualLeadCandidates || data.manualCandidates || []}
                queue={data.manualQueue || []}
                priorityCountries={data.manualPriorityCountries || []}
                canEdit={isAdmin}
                onChanged={() => state.refresh({ showLoading: false })}
              />

              <ManualPromotionPanel
                leads={data.manualStockCandidates || data.manualCandidates || []}
                queue={data.manualQueue || []}
                canEdit={isAdmin}
                onChanged={() => state.refresh({ showLoading: false })}
              />

              <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
                <Grid item xs={12} lg={8}>
                  <Box
                    sx={{
                      backgroundColor: "#fff",
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: "12px",
                      p: { xs: 2.2, md: 3 },
                      height: "100%",
                    }}
                  >
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
                      Daily reach
                    </Typography>
                    <Typography sx={{ mt: 0.3, mb: 1, fontSize: 11.5, color: TOKENS.muted }}>
                      Unique leads reached each day. This is the operational comparison between the
                      two agents.
                    </Typography>
                    <ReachChart reach={data.reach} />
                  </Box>
                </Grid>
                <Grid item xs={12} lg={4}>
                  <Box
                    sx={{
                      backgroundColor: "#fff",
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: "12px",
                      p: { xs: 2.2, md: 3 },
                      height: "100%",
                    }}
                  >
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>
                      Market distribution
                    </Typography>
                    <Typography sx={{ mt: 0.3, mb: 1.1, fontSize: 11.5, color: TOKENS.muted }}>
                      Top countries reached this month.
                    </Typography>
                    {["lead_outreach", "stock_promotion"].map((key, sectionIndex) => (
                      <Box key={key} sx={{ mt: sectionIndex ? 2 : 0 }}>
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: key === "stock_promotion" ? TOKENS.orange : TOKENS.navy,
                          }}
                        >
                          {key === "stock_promotion" ? "Stock promotion" : "Lead outreach"}
                        </Typography>
                        {(data.analytics?.[key]?.countryBreakdown || []).slice(0, 6).map((row) => (
                          <Box
                            key={`${key}-${row.country}`}
                            display="flex"
                            justifyContent="space-between"
                            gap={1}
                            sx={{ py: 0.55, borderBottom: `1px solid ${TOKENS.border}` }}
                          >
                            <Typography sx={{ fontSize: 11.5, color: TOKENS.text }}>
                              {row.country}
                            </Typography>
                            <Typography
                              sx={{ fontSize: 11.5, fontWeight: 700, color: TOKENS.text }}
                            >
                              {number(row.sent)}
                            </Typography>
                          </Box>
                        ))}
                        {!data.analytics?.[key]?.countryBreakdown?.length ? (
                          <Typography sx={{ fontSize: 11.5, color: TOKENS.muted, py: 0.8 }}>
                            No sends this month.
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </>
          ) : null}
        </PageState>
      </Box>
      <Footer />
    </DashboardLayout>
  );
}
