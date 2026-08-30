/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import DataTable from "examples/Tables/DataTable";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import useAsyncData from "hooks/useAsyncData";
import { getProfiles, updateProfile } from "services/api";
import { dateTime } from "lib/format";

const ROLES = ["ceo", "business_gm", "bi_admin", "bi_partial", "sales_manager", "sales_rep"];

export default function Admin() {
  const state = useAsyncData(getProfiles, []);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const profiles = state.data || [];

  async function save() {
    try {
      await updateProfile(selected.id, {
        full_name: selected.full_name,
        role: selected.role,
        active: Boolean(selected.active),
        updated_at: new Date().toISOString(),
      });
      setSelected(null);
      setMessage("User role updated.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const table = useMemo(
    () => ({
      columns: [
        { Header: "user", accessor: "user", width: "38%", align: "left" },
        { Header: "role", accessor: "role", align: "center" },
        { Header: "status", accessor: "status", align: "center" },
        { Header: "updated", accessor: "updated", align: "center" },
        { Header: "action", accessor: "action", align: "center" },
      ],
      rows: profiles.map((row) => ({
        user: (
          <MDBox lineHeight={1}>
            <MDTypography display="block" variant="button" fontWeight="medium">
              {row.full_name || "Unnamed user"}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {row.email}
            </MDTypography>
          </MDBox>
        ),
        role: (
          <MDBadge
            badgeContent={String(row.role).replaceAll("_", " ")}
            color={row.role === "bi_admin" || row.role === "ceo" ? "info" : "dark"}
            variant="gradient"
            size="sm"
          />
        ),
        status: (
          <MDBadge
            badgeContent={row.active ? "active" : "inactive"}
            color={row.active ? "success" : "error"}
            variant="gradient"
            size="sm"
          />
        ),
        updated: (
          <MDTypography variant="caption" color="text">
            {dateTime(row.updated_at || row.created_at)}
          </MDTypography>
        ),
        action: (
          <MDTypography
            component="button"
            type="button"
            variant="caption"
            color="info"
            fontWeight="medium"
            onClick={() => setSelected({ ...row })}
            sx={{ border: 0, background: "transparent", cursor: "pointer" }}
          >
            Edit
          </MDTypography>
        ),
      })),
    }),
    [profiles]
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <PageState loading={state.loading} error={state.error} label="Loading application users…">
          <>
            <SectionHeader
              title="Administration"
              subtitle="Application roles are separate from Supabase authentication and are enforced by Row-Level Security."
            />
            {message ? (
              <Alert
                severity={message.toLowerCase().includes("error") ? "error" : "success"}
                sx={{ mb: 3 }}
                onClose={() => setMessage("")}
              >
                {message}
              </Alert>
            ) : null}
            <Card>
              <MDBox p={3} pb={1}>
                <MDTypography variant="h6">Users and access</MDTypography>
                <MDTypography variant="button" color="text">
                  Create authentication users in Supabase, then assign their Platform application
                  role here.
                </MDTypography>
              </MDBox>
              <DataTable
                table={table}
                entriesPerPage={{ defaultValue: 15, entries: [10, 15, 25] }}
                showTotalEntries
                pagination={{ variant: "gradient", color: "info" }}
              />
            </Card>
          </>
        </PageState>
      </MDBox>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit application user</DialogTitle>
        <DialogContent>
          {selected ? (
            <MDBox pt={1} display="grid" gap={2}>
              <MDInput
                label="Full name"
                value={selected.full_name || ""}
                onChange={(event) => setSelected({ ...selected, full_name: event.target.value })}
                fullWidth
              />
              <MDInput label="Email" value={selected.email || ""} disabled fullWidth />
              <Select
                value={selected.role}
                onChange={(event) => setSelected({ ...selected, role: event.target.value })}
              >
                {ROLES.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role.replaceAll("_", " ")}
                  </MenuItem>
                ))}
              </Select>
              <Select
                value={selected.active ? "active" : "inactive"}
                onChange={(event) =>
                  setSelected({ ...selected, active: event.target.value === "active" })
                }
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </MDBox>
          ) : null}
        </DialogContent>
        <DialogActions>
          <MDButton variant="text" color="dark" onClick={() => setSelected(null)}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={save}>
            Save
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}
