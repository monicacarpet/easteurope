/* eslint-disable react/prop-types */
import Card from "@mui/material/Card";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import TimelineItem from "examples/Timeline/TimelineItem";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import PlatformIcon from "components/Platform/PlatformIcon";
import useAsyncData from "hooks/useAsyncData";
import { getActivity } from "services/api";
import { dateTime } from "lib/format";

const COLORS = {
  lead_claimed: "success",
  lead_released: "warning",
  note_added: "info",
  followup_created: "primary",
  followup_completed: "success",
  followup_updated: "warning",
  campaign_control_updated: "dark",
  email_sent: "info",
  stock_snapshot_captured: "success",
  stock_item_updated: "warning",
};

const ICONS = {
  lead_claimed: "person_add",
  lead_released: "person_remove",
  note_added: "note_add",
  followup_created: "event",
  followup_completed: "event_available",
  followup_updated: "edit_calendar",
  campaign_control_updated: "tune",
  email_sent: "outgoing_mail",
  stock_snapshot_captured: "photo_camera",
  stock_item_updated: "inventory_2",
};

function eventLabel(value) {
  return String(value || "activity").replaceAll("_", " ");
}

export default function Activity() {
  const state = useAsyncData(getActivity, []);
  const rows = state.data || [];

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={{ xs: 2, sm: 3 }}>
        <PageState loading={state.loading} error={state.error} label="Loading activity history…">
          <>
            <SectionHeader
              title="Activity log"
              subtitle="Auditable ownership, campaign, stock and follow-up events across the Platform sales workflow."
            />
            <Card sx={{ borderRadius: "14px", border: "1px solid #DDE5E8" }}>
              <MDBox pt={3} px={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Latest operational events
                </MDTypography>
                <MDBox mt={0.3} mb={2} display="flex" alignItems="center" gap={0.7}>
                  <PlatformIcon name="history" size={17} color="#0F766E" />
                  <MDTypography variant="button" color="text" fontWeight="regular">
                    newest activity appears first
                  </MDTypography>
                </MDBox>
              </MDBox>

              <MDBox p={2} pt={0.5}>
                {rows.length ? (
                  rows.map((row, index) => {
                    const type = row.event_type || row.action || "activity";
                    const details = row.details || row.metadata || {};
                    const actor =
                      row.app_profiles?.full_name ||
                      row.actor_email ||
                      details.sender_email ||
                      "System";
                    const detail =
                      details.message ||
                      details.company ||
                      details.subject ||
                      details.recipient_email ||
                      row.entity_id ||
                      row.entity_type ||
                      "Platform record";

                    return (
                      <TimelineItem
                        key={row.activity_id || `${type}-${row.created_at}-${index}`}
                        color={COLORS[type] || "dark"}
                        icon={ICONS[type] || "history"}
                        title={`${eventLabel(type)} · ${detail}`}
                        dateTime={`${actor} · ${dateTime(row.created_at)}`}
                        lastItem={index === rows.length - 1}
                      />
                    );
                  })
                ) : (
                  <MDBox py={3} px={1}>
                    <MDTypography variant="button" color="text">
                      No application activity has been recorded yet. Run the activity-log SQL patch
                      once; new notes, follow-ups, claims, campaign-control changes and sent emails
                      will then appear automatically.
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </>
        </PageState>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
