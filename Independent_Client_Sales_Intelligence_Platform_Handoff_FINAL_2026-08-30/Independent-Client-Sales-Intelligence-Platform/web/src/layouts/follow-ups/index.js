/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import DataTable from "examples/Tables/DataTable";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDBadge from "components/MDBadge";
import MDButton from "components/MDButton";
import PageState from "components/Platform/PageState";
import useAsyncData from "hooks/useAsyncData";
import { completeFollowup, getFollowups } from "services/api";
import { dateTime, number } from "lib/format";

const C = {
  text: "#20345b",
  muted: "#7b879d",
  border: "#e3e8f0",
  red: "#c84747",
  orange: "#c27b0a",
  green: "#23815d",
  navy: "#17234f",
};

function Metric({ label, value, note, color = C.navy }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 0, sm: 1.8 },
        py: 0.6,
        borderLeft: { xs: 0, sm: `1px solid ${C.border}` },
        "&:first-of-type": { borderLeft: 0, pl: 0 },
      }}
    >
      <MDTypography variant="caption" sx={{ color: C.muted }}>
        {label}
      </MDTypography>
      <MDTypography variant="h5" sx={{ color, fontWeight: 700, mt: 0.25 }}>
        {value}
      </MDTypography>
      <MDTypography variant="caption" sx={{ color: C.muted }}>
        {note}
      </MDTypography>
    </Box>
  );
}

export default function FollowUps() {
  const state = useAsyncData(getFollowups, [], { cacheKey: "followups" });
  const [message, setMessage] = useState("");
  const rows = state.data || [];
  const now = Date.now();
  const open = rows.filter((row) => row.status !== "completed" && row.status !== "cancelled");
  const overdue = open.filter((row) => new Date(row.due_at).getTime() < now);
  const dueToday = open.filter((row) => {
    const due = new Date(row.due_at);
    const today = new Date();
    return due.toDateString() === today.toDateString();
  });
  const upcoming = open.filter((row) => new Date(row.due_at).getTime() >= now);

  async function complete(id) {
    try {
      await completeFollowup(id);
      setMessage("Follow-up completed.");
      state.refresh({ showLoading: false });
    } catch (error) {
      setMessage(error.message);
    }
  }

  const table = useMemo(
    () => ({
      columns: [
        { Header: "company", accessor: "company", width: "28%", align: "left" },
        { Header: "next action", accessor: "action", width: "32%", align: "left" },
        { Header: "due", accessor: "due", align: "center" },
        { Header: "status", accessor: "status", align: "center" },
        { Header: "complete", accessor: "complete", align: "center" },
      ],
      rows: rows.map((row) => {
        const isOverdue = row.status !== "completed" && new Date(row.due_at).getTime() < now;
        const lead = row.leads || {};
        return {
          company: (
            <MDBox lineHeight={1}>
              <MDTypography display="block" variant="button" fontWeight="medium">
                {lead.name || row.company_name || row.lead_id}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {lead.country || row.country || "—"} · {lead.email || row.owner_email || "—"}
              </MDTypography>
            </MDBox>
          ),
          action: (
            <MDTypography variant="caption" color="text" fontWeight="medium">
              {row.title}
            </MDTypography>
          ),
          due: (
            <MDTypography
              variant="caption"
              color={isOverdue ? "error" : "text"}
              fontWeight="medium"
            >
              {dateTime(row.due_at)}
            </MDTypography>
          ),
          status: (
            <MDBadge
              badgeContent={
                row.status === "completed" ? "completed" : isOverdue ? "overdue" : "open"
              }
              color={row.status === "completed" ? "success" : isOverdue ? "error" : "info"}
              variant="contained"
              size="sm"
            />
          ),
          complete:
            row.status === "completed" ? (
              <MDTypography variant="caption" color="success" fontWeight="bold">
                Done
              </MDTypography>
            ) : (
              <MDButton
                variant="text"
                color="success"
                size="small"
                onClick={() => complete(row.followup_id)}
              >
                Done
              </MDButton>
            ),
        };
      }),
    }),
    [rows]
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={{ xs: 2, sm: 3 }} sx={{ minWidth: 0 }}>
        <PageState loading={state.loading} error={state.error} label="Loading follow-up schedule…">
          <>
            <Box sx={{ mb: 2.2 }}>
              <MDTypography variant="h4" sx={{ color: C.text, fontWeight: 700 }}>
                Follow-ups
              </MDTypography>
              <MDTypography variant="caption" sx={{ color: C.muted }}>
                The next action queue created from lead workspaces.
              </MDTypography>
            </Box>
            {message ? (
              <Alert
                severity={message.toLowerCase().includes("error") ? "error" : "success"}
                sx={{ mb: 2, "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
                onClose={() => setMessage("")}
              >
                {message}
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,minmax(0,1fr))" },
                gap: { xs: 1.5, md: 0 },
                backgroundColor: "#fff",
                border: `1px solid ${C.border}`,
                borderRadius: "8px",
                p: 2,
                mb: 2.2,
              }}
            >
              <Metric
                label="Overdue"
                value={number(overdue.length)}
                note="needs attention"
                color={C.red}
              />
              <Metric
                label="Due today"
                value={number(dueToday.length)}
                note="today's actions"
                color={C.orange}
              />
              <Metric label="Upcoming" value={number(upcoming.length)} note="future open actions" />
              <Metric
                label="Completed"
                value={number(rows.length - open.length)}
                note="closed actions"
                color={C.green}
              />
            </Box>

            <Card sx={{ borderRadius: "8px", boxShadow: "none", border: `1px solid ${C.border}` }}>
              <MDBox px={2.4} pt={2.2} pb={0.4}>
                <MDTypography variant="h6" sx={{ color: C.text }}>
                  Account action queue
                </MDTypography>
                <MDTypography variant="caption" sx={{ color: C.muted }}>
                  {number(rows.length)} scheduled actions
                </MDTypography>
              </MDBox>
              <DataTable
                table={table}
                entriesPerPage={{ defaultValue: 25, entries: [10, 25, 50] }}
                showTotalEntries
                stateStorageKey="platform-followups:table"
                pagination={{ variant: "gradient", color: "info" }}
              />
            </Card>
          </>
        </PageState>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
