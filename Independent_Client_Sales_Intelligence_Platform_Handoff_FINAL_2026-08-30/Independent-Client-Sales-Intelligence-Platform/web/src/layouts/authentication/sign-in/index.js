import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import BasicLayout from "layouts/authentication/components/BasicLayout";
import bgImage from "assets/images/platform-cover.svg";
import logo from "assets/images/platform-logo.svg";
import { useAuth } from "auth/AuthContext";
import { APP_NAME, COMPANY_NAME } from "config/brand";

export default function SignIn() {
  const { signIn, isAuthenticated, demoMode } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const destination = location.state?.from?.pathname || "/dashboard";

  if (isAuthenticated) return <Navigate to={destination} replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <BasicLayout image={bgImage}>
      <Card
        sx={{
          borderRadius: "10px",
          boxShadow: "0 14px 34px rgba(20,32,60,0.14)",
          border: "1px solid #e2e7ef",
          overflow: "visible",
        }}
      >
        <MDBox mx={3} mt={3} pt={0.5} pb={1} textAlign="center">
          <MDBox
            component="img"
            src={logo}
            alt={COMPANY_NAME}
            width="5.5rem"
            height="4.4rem"
            mb={0.75}
            sx={{
              objectFit: "contain",
              borderRadius: "50%",
              backgroundColor: "transparent",
              filter: "none",
            }}
          />
          <MDTypography variant="h4" fontWeight="medium" sx={{ color: "#17234f" }}>
            {APP_NAME}
          </MDTypography>
          <MDTypography variant="button" sx={{ color: "#7b879f" }}>
            Leads · GIS · Stock · Campaign operations
          </MDTypography>
        </MDBox>
        <MDBox pt={4} pb={3} px={3} component="form" onSubmit={submit}>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          {demoMode ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Preview mode is active because Supabase browser credentials are not configured.
            </Alert>
          ) : null}
          {!demoMode ? (
            <>
              <MDBox mb={2}>
                <MDInput
                  type="email"
                  label="Work email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  fullWidth
                  required
                />
              </MDBox>
              <MDBox mb={2}>
                <MDInput
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  fullWidth
                  required
                />
              </MDBox>
            </>
          ) : null}
          <MDBox mt={4} mb={1}>
            <MDButton
              type="submit"
              variant="contained"
              color="dark"
              fullWidth
              disabled={loading}
              sx={{ borderRadius: "6px", boxShadow: "none", textTransform: "none" }}
            >
              <Icon>login</Icon>&nbsp;{" "}
              {demoMode ? "Open preview dashboard" : loading ? "Signing in…" : "Sign in"}
            </MDButton>
          </MDBox>
          <MDBox mt={2} textAlign="center">
            <MDTypography variant="caption" color="text">
              Accounts are created by a company administrator. Public sign-up is disabled.
            </MDTypography>
          </MDBox>
        </MDBox>
      </Card>
    </BasicLayout>
  );
}
