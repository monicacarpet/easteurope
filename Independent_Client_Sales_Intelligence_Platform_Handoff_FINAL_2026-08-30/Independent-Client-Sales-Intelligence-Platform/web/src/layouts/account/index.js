import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";
import SectionHeader from "components/Platform/SectionHeader";
import { useAuth } from "auth/AuthContext";

export default function Account() {
  const { profile, signOut, demoMode, isAdmin, canViewAnalytics } = useAuth();
  const permissions = [
    ["Lead database", true],
    ["Claim and manage leads", true],
    ["Stock and campaign analytics", canViewAnalytics || isAdmin],
    ["Edit stock pricing", isAdmin],
    ["Manage users", isAdmin],
  ];
  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <SectionHeader
          title="Account"
          subtitle="Current identity, role and effective application permissions."
        />
        <Grid container spacing={3}>
          <Grid item xs={12} lg={5}>
            <Card>
              <MDBox p={3} textAlign="center">
                <MDBox
                  width="4rem"
                  height="4rem"
                  borderRadius="50%"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  mx="auto"
                  mb={2}
                  sx={{ border: "1px solid #E6EBF3", backgroundColor: "#F8FAFD", color: "#26336F" }}
                >
                  <Icon
                    baseClassName="material-icons-outlined"
                    sx={{ fontSize: "26px !important" }}
                  >
                    person_outline
                  </Icon>
                </MDBox>
                <MDTypography variant="h5" fontWeight="medium">
                  {profile?.full_name || "Platform user"}
                </MDTypography>
                <MDTypography variant="button" color="text" display="block">
                  {profile?.email}
                </MDTypography>
                <MDBox mt={2}>
                  <MDBadge
                    badgeContent={String(profile?.role || "sales_rep").replaceAll("_", " ")}
                    color="info"
                    variant="gradient"
                    size="md"
                  />
                </MDBox>
                {demoMode ? (
                  <MDTypography variant="caption" color="warning" display="block" mt={2}>
                    Preview account—connect Supabase for production authentication.
                  </MDTypography>
                ) : null}
                <MDBox mt={3}>
                  <MDButton variant="outlined" color="dark" onClick={signOut}>
                    Sign out
                  </MDButton>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} lg={7}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" mb={2}>
                  Effective permissions
                </MDTypography>
                {permissions.map(([label, enabled]) => (
                  <MDBox
                    key={label}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={1.25}
                    borderBottom="1px solid"
                    borderColor="grey-200"
                  >
                    <MDTypography variant="button" color="text">
                      {label}
                    </MDTypography>
                    <MDBadge
                      badgeContent={enabled ? "allowed" : "restricted"}
                      color={enabled ? "success" : "dark"}
                      variant="gradient"
                      size="sm"
                    />
                  </MDBox>
                ))}
                <MDTypography variant="caption" color="text" display="block" mt={2}>
                  Permissions are enforced by Supabase Row-Level Security, not only hidden in the
                  interface.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
