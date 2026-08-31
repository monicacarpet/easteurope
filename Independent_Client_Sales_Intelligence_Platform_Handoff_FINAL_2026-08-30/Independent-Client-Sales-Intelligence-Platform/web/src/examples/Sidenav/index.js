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
import { MANTIS_BREAKPOINTS } from "config/mantisLayout";

function NavIcon({ name }) {
  return (
    <Icon
      baseClassName="material-icons-outlined"
      sx={{ fontSize: "19px !important", lineHeight: 1 }}
    >
      {name}
    </Icon>
  );
}

NavIcon.propTypes = { name: PropTypes.string.isRequired };

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

  const closeMobile = () => {
    if (window.innerWidth < MANTIS_BREAKPOINTS.lg) setMiniSidenav(dispatch, true);
  };

  useEffect(() => {
    function handleViewport() {
      // Match Mantis: temporary navigation below lg, mini navigation between lg and xl,
      // and the full 260px drawer on wide desktop screens.
      setMiniSidenav(dispatch, window.innerWidth < MANTIS_BREAKPOINTS.xl);
    }

    window.addEventListener("resize", handleViewport);
    handleViewport();
    return () => window.removeEventListener("resize", handleViewport);
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
          onClick={closeMobile}
        >
          <SidenavCollapse name={name} icon={NAV_ICONS[key] || icon} active={isActive(route)} />
        </NavLink>
      );
    }

    if (type === "title") {
      return (
        <MDBox
          key={key}
          px={miniSidenav ? 1 : 2.6}
          pt={1.7}
          pb={0.65}
          sx={{
            display: miniSidenav ? "none" : "block",
            overflow: "hidden",
          }}
        >
          <MDTypography
            variant="caption"
            sx={{
              color: platformTokens.sidebar.muted,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
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
        <Divider key={key} sx={{ my: 1, mx: 1.5, borderColor: platformTokens.sidebar.border }} />
      );
    }

    return null;
  });

  return (
    <SidenavRoot
      {...rest}
      variant="permanent"
      ownerState={{ miniSidenav }}
      data-sidenav-color={color}
    >
      <MDBox
        height={60}
        px={miniSidenav ? 1.25 : 2.25}
        display="flex"
        alignItems="center"
        flexShrink={0}
        sx={{ borderBottom: `1px solid ${platformTokens.sidebar.border}` }}
      >
        <MDBox
          component={NavLink}
          to="/dashboard"
          display="flex"
          alignItems="center"
          justifyContent={miniSidenav ? "center" : "flex-start"}
          width="100%"
          minWidth={0}
        >
          {brand ? (
            <MDBox
              component="img"
              src={brand}
              alt="Platform"
              width="34px"
              height="34px"
              sx={{ objectFit: "contain", flex: "0 0 auto" }}
            />
          ) : null}

          <MDBox
            ml={miniSidenav ? 0 : 1.1}
            sx={{
              display: miniSidenav ? "none" : "block",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <MDTypography
              variant="button"
              sx={{
                color: platformTokens.sidebar.text,
                fontSize: 15,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {brandName}
            </MDTypography>
            <MDTypography
              display="block"
              variant="caption"
              sx={{
                color: platformTokens.sidebar.muted,
                fontSize: 10.5,
                mt: 0.05,
                whiteSpace: "nowrap",
              }}
            >
              Sales intelligence
            </MDTypography>
          </MDBox>
        </MDBox>

        <IconButton
          size="small"
          onClick={closeMobile}
          sx={{
            display: { xs: "inline-flex", lg: "none" },
            color: platformTokens.sidebar.muted,
            ml: 0.5,
          }}
        >
          <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "18px !important" }}>
            close
          </Icon>
        </IconButton>
      </MDBox>

      <List
        sx={{
          pt: 1.25,
          pb: 1,
          px: 0,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {renderRoutes}
      </List>

      <MDBox
        px={miniSidenav ? 1.2 : 1.5}
        py={1.35}
        flexShrink={0}
        sx={{ borderTop: `1px solid ${platformTokens.sidebar.border}` }}
      >
        <MDBox display="flex" alignItems="center" gap={1}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              fontSize: 10.5,
              fontWeight: 600,
              bgcolor: platformTokens.brand.primarySoft,
              color: platformTokens.brand.primary,
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
                fontSize: 11.5,
                fontWeight: 500,
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
              sx={{ color: platformTokens.sidebar.muted, fontSize: 10, mt: 0.2 }}
            >
              {prettyRole(profile?.role)}
            </MDTypography>
          </MDBox>

          <Tooltip title="Sign out" placement="right">
            <IconButton
              size="small"
              onClick={signOut}
              sx={{
                display: miniSidenav ? "none" : "inline-flex",
                width: 30,
                height: 30,
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

Sidenav.defaultProps = { color: "info", brand: "" };
Sidenav.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "info", "success", "warning", "error", "dark"]),
  brand: PropTypes.string,
  brandName: PropTypes.string.isRequired,
  routes: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default Sidenav;
