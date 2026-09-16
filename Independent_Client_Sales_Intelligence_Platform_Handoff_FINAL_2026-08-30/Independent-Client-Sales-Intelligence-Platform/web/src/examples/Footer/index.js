import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import { COMPANY_NAME } from "config/brand";
import platformTokens from "assets/theme/platformTokens";
import { useWorkspaceShell } from "context/WorkspaceShellContext";

export default function Footer() {
  const insidePersistentShell = useWorkspaceShell();

  if (insidePersistentShell) return null;

  return (
    <MDBox
      width="100%"
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      px={0}
      py={2}
      sx={{ borderTop: `1px solid ${platformTokens.surface.border}` }}
    >
      <MDTypography variant="caption" sx={{ color: platformTokens.text.tertiary, fontSize: 10.5 }}>
        © {new Date().getFullYear()} {COMPANY_NAME} · Internal Sales Intelligence
      </MDTypography>
      <MDTypography
        variant="caption"
        sx={{
          color: platformTokens.text.tertiary,
          fontSize: 10.5,
          display: { xs: "none", md: "block" },
        }}
      >
        Authorized internal users only
      </MDTypography>
    </MDBox>
  );
}
