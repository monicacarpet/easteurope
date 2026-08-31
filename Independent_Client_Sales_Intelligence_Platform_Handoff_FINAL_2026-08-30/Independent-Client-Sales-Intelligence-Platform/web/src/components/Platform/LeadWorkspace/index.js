/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import PlatformIcon from "components/Platform/PlatformIcon";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import { addFollowup, addLeadNote, getLeadWorkspace } from "services/api";
import { dateTime, safeUrl } from "lib/format";

export default function LeadWorkspace({ lead, open, onClose }) {
  const [workspace, setWorkspace] = useState({ notes: [], followups: [] });
  const [note, setNote] = useState("");
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupAt, setFollowupAt] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !lead?.lead_id) return;
    getLeadWorkspace(lead.lead_id)
      .then(setWorkspace)
      .catch((error) => setMessage(error.message));
  }, [open, lead]);

  async function saveNote() {
    if (!note.trim()) return;
    try {
      const created = await addLeadNote(lead.lead_id, note.trim());
      setWorkspace((current) => ({ ...current, notes: [created, ...current.notes] }));
      setNote("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveFollowup() {
    if (!followupTitle.trim() || !followupAt) return;
    try {
      const created = await addFollowup(
        lead.lead_id,
        new Date(followupAt).toISOString(),
        followupTitle.trim()
      );
      setWorkspace((current) => ({ ...current, followups: [...current.followups, created] }));
      setFollowupTitle("");
      setFollowupAt("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { maxHeight: "calc(100vh - 32px)", borderRadius: "10px" } }}
    >
      <DialogTitle>{lead?.name || "Lead workspace"}</DialogTitle>
      <DialogContent sx={{ overflowY: "auto", px: { xs: 2, md: 2.5 } }}>
        {message ? (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              alignItems: "flex-start",
              "& .MuiAlert-message": {
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              },
            }}
            onClose={() => setMessage("")}
          >
            {message}
          </Alert>
        ) : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <MDTypography variant="h6" mb={1}>
              Company profile
            </MDTypography>
            <MDBox display="grid" gap={0.75}>
              <MDTypography variant="button" color="text">
                <strong>Location:</strong> {lead?.city || "—"}, {lead?.state || "—"},{" "}
                {lead?.country || "—"}
              </MDTypography>
              <MDTypography variant="button" color="text">
                <strong>Contact:</strong> {lead?.contact_full_name || "Not identified"}
              </MDTypography>
              <MDTypography variant="button" color="text">
                <strong>Position:</strong> {lead?.contact_job_title || "—"}
              </MDTypography>
              <MDTypography variant="button" color="text">
                <strong>Email:</strong> {lead?.email || "—"}
              </MDTypography>
              <MDTypography variant="button" color="text">
                <strong>Phone:</strong> {lead?.phone || "—"}
              </MDTypography>
              <MDTypography
                component="a"
                href={safeUrl(lead?.website)}
                target="_blank"
                rel="noreferrer"
                variant="button"
                color="info"
              >
                <PlatformIcon name="open_in_new" size={16} />
                &nbsp; open company website
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {lead?.gold_split_reason || lead?.qualification_reason || "No qualification note."}
              </MDTypography>
            </MDBox>
            <Divider />
            <MDTypography variant="h6" mb={1}>
              Schedule follow-up
            </MDTypography>
            <MDBox display="grid" gap={1.5}>
              <MDInput
                label="Next action"
                value={followupTitle}
                onChange={(event) => setFollowupTitle(event.target.value)}
                fullWidth
              />
              <MDInput
                type="datetime-local"
                value={followupAt}
                onChange={(event) => setFollowupAt(event.target.value)}
                fullWidth
              />
              <MDButton variant="gradient" color="info" onClick={saveFollowup}>
                Create follow-up
              </MDButton>
            </MDBox>
          </Grid>
          <Grid item xs={12} md={7}>
            <MDTypography variant="h6" mb={1}>
              Sales notes
            </MDTypography>
            <MDBox display="flex" gap={1} mb={2}>
              <MDInput
                label="Add a concise note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                fullWidth
                multiline
                rows={2}
              />
              <MDButton variant="gradient" color="dark" onClick={saveNote}>
                Add
              </MDButton>
            </MDBox>
            <MDBox maxHeight="15rem" overflow="auto">
              {workspace.notes.length ? (
                workspace.notes.map((row) => (
                  <MDBox key={row.note_id} p={1.5} mb={1} borderRadius="lg" bgColor="grey-100">
                    <MDTypography variant="button" display="block">
                      {row.body}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {dateTime(row.created_at)}
                    </MDTypography>
                  </MDBox>
                ))
              ) : (
                <MDTypography variant="button" color="text">
                  No notes yet.
                </MDTypography>
              )}
            </MDBox>
            <Divider />
            <MDTypography variant="h6" mb={1}>
              Upcoming actions
            </MDTypography>
            <MDBox maxHeight="12rem" overflow="auto">
              {workspace.followups.length ? (
                workspace.followups.map((row) => (
                  <MDBox key={row.followup_id} display="flex" justifyContent="space-between" py={1}>
                    <MDTypography variant="button">{row.title}</MDTypography>
                    <MDTypography variant="caption" color="text">
                      {dateTime(row.due_at)}
                    </MDTypography>
                  </MDBox>
                ))
              ) : (
                <MDTypography variant="button" color="text">
                  No follow-ups scheduled.
                </MDTypography>
              )}
            </MDBox>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <MDButton color="dark" variant="text" onClick={onClose}>
          Close
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}
