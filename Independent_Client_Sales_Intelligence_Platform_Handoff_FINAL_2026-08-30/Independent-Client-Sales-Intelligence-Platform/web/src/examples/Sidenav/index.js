import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Icon from "@mui/material/Icon";
import Tooltip from "@mui/material/Tooltip";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import SidenavCollapse from "examples/Sidenav/SidenavCollapse";
import SidenavRoot from "examples/Sidenav/SidenavRoot";
import { useMaterialUIController, setMiniSidenav } from "context";
import { useAuth } from "auth/AuthContext";
import platformTokens from "assets/theme/platformTokens";

function NavIcon({ name }) {
  return (
    <Icon
      baseClassName="material-icons-outlined"
      sx={{ fontSize: "18px !important", lineHeight: 1 }}
    >
      {name}
    </Icon>
  );
}

NavIcon.propTypes = {
  name: PropTypes.string.isRequired,
};

const NAV_ICONS = {
  dashboard: <NavIcon name="space_dashboard" />,
  leads: <NavIcon name="business" />,
  "my-leads": <NavIcon name="groups" />,
  "follow-ups": <NavIcon name="event_available" />,
  stock: <NavIcon name="inventory_2" />,
  campaigns: <NavIcon name="campaign" />,
  gis: <NavIcon name="public" />,
  "data-quality": <NavIcon name="fact_check" />,
  reports: <NavIcon name="description" />,
  activity: <NavIcon name="history" />,
  admin: <NavIcon name="admin_panel_settings" />,
  account: <NavIcon name="person_outline" />,
};

function initials(name) {
  return String(name || "Platform")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function prettyRole(role) {
  return String(role || "user")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Sidenav({ color, brand, brandName, routes, ...rest }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const closeSidenav = () => setMiniSidenav(dispatch, true);
  const toggleSidenav = () => setMiniSidenav(dispatch, !miniSidenav);

  useEffect(() => {
    function handleMiniSidenav() {
      if (window.innerWidth < 1200) setMiniSidenav(dispatch, true);
    }

    window.addEventListener("resize", handleMiniSidenav);
    handleMiniSidenav();
    return () => window.removeEventListener("resize", handleMiniSidenav);
  }, [dispatch]);

  const isActive = (route) => {
    if (!route) return false;
    if (route === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname === route || location.pathname.startsWith(`${route}/`);
  };

  const renderRoutes = routes.map(({ type, name, icon, title, key, route }) => {
    if (type === "collapse") {
      return (
        <NavLink
          key={key}
          to={route}
          style={{ color: "inherit", textDecoration: "none" }}
          onClick={() => {
            if (window.innerWidth < 1200) closeSidenav();
          }}
        >
          <SidenavCollapse name={name} icon={NAV_ICONS[key] || icon} active={isActive(route)} />
        </NavLink>
      );
    }

    if (type === "title") {
      return (
        <MDBox
          key={key}
          px={miniSidenav ? 1 : 2}
          pt={1.75}
          pb={0.65}
          sx={{
            opacity: miniSidenav ? 0 : 1,
            height: miniSidenav ? 10 : "auto",
            overflow: "hidden",
          }}
        >
          <MDTypography
            variant="caption"
            sx={{
              color: platformTokens.sidebar.muted,
              fontSize: 9.2,
              fontWeight: 700,
              letterSpacing: "0.085em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </MDTypography>
        </MDBox>
      );
    }

    if (type === "divider") {
      return (
        <Divider
          key={key}
          sx={{ my: 1.1, mx: 1.7, borderColor: platformTokens.sidebar.border, opacity: 1 }}
        />
      );
    }

    return null;
  });

  return (
    <SidenavRoot {...rest} variant="permanent" ownerState={{ miniSidenav }}>
      <MDBox
        height={74}
        px={miniSidenav ? 0 : 1.55}
        display="flex"
        alignItems="center"
        position="relative"
        flexShrink={0}
        sx={{ borderBottom: `1px solid ${platformTokens.sidebar.border}` }}
      >
        <MDBox display={{ xs: "flex", xl: "none" }} position="absolute" top={17} right={10}>
          <IconButton
            size="small"
            onClick={closeSidenav}
            sx={{ color: platformTokens.sidebar.muted }}
          >
            <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "18px !important" }}>
              close
            </Icon>
          </IconButton>
        </MDBox>

        <Tooltip
          title={miniSidenav ? "Expand navigation" : "Collapse navigation"}
          placement="right"
        >
          <IconButton
            size="small"
            onClick={toggleSidenav}
            sx={{
              display: { xs: "none", xl: "inline-flex" },
              position: "absolute",
              top: 24,
              right: miniSidenav ? 0 : 7,
              width: 14,
              height: 24,
              minWidth: 14,
              p: 0,
              zIndex: 4,
              color: "rgba(255,255,255,0.74)",
              backgroundColor: "transparent",
              borderRadius: 0,
              "&:hover": {
                color: "rgba(255,255,255,0.98)",
                backgroundColor: "transparent",
              },
            }}
          >
            <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "18px !important" }}>
              {miniSidenav ? "chevron_right" : "chevron_left"}
            </Icon>
          </IconButton>
        </Tooltip>

        <MDBox
          component={NavLink}
          to="/dashboard"
          display="flex"
          alignItems="center"
          justifyContent={miniSidenav ? "center" : "flex-start"}
          width="100%"
          sx={{ pr: miniSidenav ? 0 : 2.4 }}
        >
          {brand ? (
            <MDBox
              component="img"
              src={brand}
              alt="Platform"
              width={miniSidenav ? "38px" : "40px"}
              height={miniSidenav ? "38px" : "40px"}
              sx={{
                objectFit: "contain",
                flex: "0 0 auto",
                borderRadius: "50%",
                backgroundColor: "transparent",
                p: 0,
              }}
            />
          ) : null}

          <MDBox
            ml={miniSidenav ? 0 : 1.05}
            sx={{
              minWidth: 0,
              opacity: miniSidenav ? 0 : 1,
              width: miniSidenav ? 0 : "auto",
              overflow: "hidden",
              transition: "opacity 140ms ease",
            }}
          >
            <MDTypography
              variant="button"
              sx={{
                color: platformTokens.sidebar.text,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {brandName}
            </MDTypography>
            <MDTypography
              display="block"
              variant="caption"
              sx={{ color: platformTokens.sidebar.muted, fontSize: 9.5, mt: 0.15 }}
            >
              Sales & stock intelligence
            </MDTypography>
          </MDBox>
        </MDBox>
      </MDBox>

      <List
        sx={{
          pt: 1.1,
          pb: 0.75,
          px: 0,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: `${platformTokens.sidebar.border} transparent`,
        }}
      >
        {renderRoutes}
      </List>

      <MDBox
        p={miniSidenav ? 0.85 : 1}
        flexShrink={0}
        sx={{ borderTop: `1px solid ${platformTokens.sidebar.border}` }}
      >
        <MDBox display="flex" alignItems="center" gap={0.9} px={miniSidenav ? 0 : 0.15} py={0.25}>
          <Avatar
            sx={{
              width: 31,
              height: 31,
              fontSize: 10.2,
              fontWeight: 700,
              bgcolor: platformTokens.sidebar.activeBackground,
              color: platformTokens.sidebar.text,
              border: `1px solid ${platformTokens.sidebar.border}`,
              flex: "0 0 auto",
            }}
          >
            {initials(profile?.full_name)}
          </Avatar>

          <MDBox sx={{ minWidth: 0, flex: 1, display: miniSidenav ? "none" : "block" }}>
            <MDTypography
              variant="caption"
              display="block"
              sx={{
                color: platformTokens.sidebar.text,
                fontSize: 10.9,
                fontWeight: 600,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {profile?.full_name || "Platform User"}
            </MDTypography>
            <MDTypography
              variant="caption"
              display="block"
              sx={{ color: platformTokens.sidebar.muted, fontSize: 9.4, mt: 0.2 }}
            >
              {prettyRole(profile?.role)}
            </MDTypography>
          </MDBox>

          <Tooltip title="Sign out" placement="right">
            <IconButton
              size="small"
              onClick={signOut}
              sx={{
                width: 29,
                height: 29,
                color: platformTokens.sidebar.muted,
                "&:hover": {
                  color: platformTokens.sidebar.text,
                  backgroundColor: platformTokens.sidebar.hoverBackground,
                },
              }}
            >
              <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "17px !important" }}>
                logout
              </Icon>
            </IconButton>
          </Tooltip>
        </MDBox>
      </MDBox>
    </SidenavRoot>
  );
}

Sidenav.defaultProps = {
  color: "info",
  brand: "",
};

Sidenav.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "info", "success", "warning", "error", "dark"]),
  brand: PropTypes.string,
  brandName: PropTypes.string.isRequired,
  routes: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default Sidenav;
