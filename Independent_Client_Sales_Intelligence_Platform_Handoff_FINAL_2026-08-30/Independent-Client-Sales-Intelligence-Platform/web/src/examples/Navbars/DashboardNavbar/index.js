import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChartOutlined,
  BellOutlined,
  DatabaseOutlined,
  DownOutlined,
  HomeOutlined,
  LogoutOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useAuth } from "auth/AuthContext";
import platformLogo from "assets/images/platform-logo.svg";
import platformTokens from "assets/theme/platformTokens";
import LanguageSwitcher from "components/Platform/LanguageSwitcher";
import { APP_NAME, BRAND_SHORT_NAME } from "config/brand";
import {
  WORKSPACE_HEADER_HEIGHT,
  WORKSPACE_MAX_WIDTH,
  WORKSPACE_NAV_HEIGHT,
} from "config/workspaceLayout";
import routes from "routes";

export const NAV_GROUPS = [
  { key: "overview", label: "Overview", icon: HomeOutlined, routeKeys: ["dashboard"] },
  {
    key: "sales",
    label: "Sales",
    icon: TeamOutlined,
    routeKeys: ["leads", "my-leads", "follow-ups"],
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: DatabaseOutlined,
    routeKeys: ["stock", "campaigns"],
  },
  {
    key: "insights",
    label: "Insights",
    icon: BarChartOutlined,
    routeKeys: ["gis", "data-quality", "reports", "activity"],
  },
  {
    key: "system",
    label: "System",
    icon: SettingOutlined,
    routeKeys: ["admin", "account"],
  },
];

function initials(name) {
  return String(name || "Platform")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(role) {
  return String(role || "user").replaceAll("_", " ");
}

function routeIsActive(pathname, route) {
  if (!route) return false;
  if (route === "/dashboard") return pathname === "/dashboard";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function DashboardNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, demoMode, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [navAnchor, setNavAnchor] = useState(null);
  const [navGroupKey, setNavGroupKey] = useState(null);
  const [notificationAnchor, setNotificationAnchor] = useState(null);
  const [profileAnchor, setProfileAnchor] = useState(null);

  const visibleRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          route.type === "collapse" &&
          route.route &&
          (!route.roles || route.roles.includes(profile?.role))
      ),
    [profile?.role]
  );

  const groupedNavigation = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        routes: group.routeKeys
          .map((key) => visibleRoutes.find((route) => route.key === key))
          .filter(Boolean),
      })).filter((group) => group.routes.length),
    [visibleRoutes]
  );

  const openGroup = groupedNavigation.find((group) => group.key === navGroupKey);

  function submitSearch(event) {
    event.preventDefault();
    const value = search.trim().toLowerCase();
    if (!value) return;
    if (value.includes("stock") || value.includes("inventory") || value.includes("库存")) {
      navigate("/stock");
    } else if (
      value.includes("map") ||
      value.includes("gis") ||
      value.includes("country") ||
      value.includes("地图")
    ) {
      navigate("/gis");
    } else if (value.includes("email") || value.includes("campaign") || value.includes("推广")) {
      navigate("/campaigns");
    } else if (value.includes("follow") || value.includes("跟进")) {
      navigate("/follow-ups");
    } else {
      navigate("/leads");
    }
    setSearch("");
  }

  function openNavigationMenu(event, groupKey) {
    setNavAnchor(event.currentTarget);
    setNavGroupKey(groupKey);
  }

  function closeNavigationMenu() {
    setNavAnchor(null);
    setNavGroupKey(null);
  }

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="transparent"
      sx={{
        zIndex: 1250,
        inset: "0 0 auto 0",
        width: "100%",
        backgroundColor: "transparent",
        boxShadow: "0 1px 0 rgba(15, 23, 42, 0.08)",
      }}
    >
      <Box
        sx={{ height: WORKSPACE_HEADER_HEIGHT, backgroundColor: platformTokens.header.background }}
      >
        <Box
          sx={{
            height: "100%",
            width: "100%",
            maxWidth: `${WORKSPACE_MAX_WIDTH}px`,
            mx: "auto",
            px: { xs: 2, sm: 3, lg: 4.5 },
            display: "flex",
            alignItems: "center",
            gap: { xs: 1.25, md: 2.5 },
          }}
        >
          <Box
            component={Link}
            to="/dashboard"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.1,
              minWidth: 0,
              flexShrink: 0,
              textDecoration: "none",
            }}
          >
            <Box
              component="img"
              src={platformLogo}
              alt="Platform"
              sx={{
                width: 36,
                height: 36,
                p: 0.35,
                borderRadius: "11px",
                backgroundColor: "#FFFFFF",
                objectFit: "contain",
              }}
            />
            <Box sx={{ minWidth: 0, display: { xs: "none", sm: "block" } }}>
              <Typography
                sx={{
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                }}
              >
                {BRAND_SHORT_NAME}
              </Typography>
              <Typography
                sx={{
                  color: platformTokens.header.muted,
                  fontSize: 10.5,
                  mt: 0.25,
                  whiteSpace: "nowrap",
                }}
              >
                {APP_NAME}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
            <Box
              component="form"
              onSubmit={submitSearch}
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                width: "min(440px, 100%)",
                height: 40,
                px: 1.4,
                border: `1px solid ${platformTokens.header.border}`,
                borderRadius: "12px",
                backgroundColor: platformTokens.header.control,
                transition: "border-color 140ms ease, background-color 140ms ease",
                "&:focus-within": {
                  borderColor: platformTokens.brand.primaryLight,
                  backgroundColor: platformTokens.header.controlHover,
                },
              }}
            >
              <SearchOutlined style={{ color: platformTokens.header.muted, fontSize: 17 }} />
              <InputBase
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pages"
                fullWidth
                sx={{
                  ml: 1,
                  color: "#FFFFFF",
                  fontSize: 12.5,
                  "& input::placeholder": { color: platformTokens.header.muted, opacity: 1 },
                }}
              />
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.55, flexShrink: 0 }}>
            {demoMode ? (
              <Typography
                variant="caption"
                sx={{
                  color: "#FDE68A",
                  fontWeight: 700,
                  mr: 0.25,
                  display: { xs: "none", lg: "block" },
                }}
              >
                PREVIEW
              </Typography>
            ) : null}

            <LanguageSwitcher inline dark />

            <Tooltip title="Notifications">
              <IconButton
                size="small"
                onClick={(event) => setNotificationAnchor(event.currentTarget)}
                sx={{
                  width: 38,
                  height: 38,
                  color: platformTokens.header.text,
                  borderRadius: "11px",
                  "&:hover": { backgroundColor: platformTokens.header.controlHover },
                }}
              >
                <BellOutlined style={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            <Button
              onClick={(event) => setProfileAnchor(event.currentTarget)}
              sx={{
                minWidth: 0,
                height: 42,
                px: 0.55,
                borderRadius: "12px",
                textTransform: "none",
                color: platformTokens.header.text,
                "&:hover": { backgroundColor: platformTokens.header.controlHover },
              }}
            >
              <Avatar
                sx={{
                  width: 31,
                  height: 31,
                  bgcolor: platformTokens.brand.primary,
                  color: "#FFFFFF",
                  fontSize: 10.5,
                  fontWeight: 700,
                }}
              >
                {initials(profile?.full_name)}
              </Avatar>
              <Box sx={{ display: { xs: "none", lg: "block" }, ml: 0.85, textAlign: "left" }}>
                <Typography
                  sx={{ color: "#FFFFFF", fontSize: 11.5, fontWeight: 600, lineHeight: 1.15 }}
                >
                  {profile?.full_name || "Platform User"}
                </Typography>
                <Typography
                  sx={{
                    color: platformTokens.header.muted,
                    fontSize: 9.5,
                    mt: 0.15,
                    textTransform: "capitalize",
                  }}
                >
                  {roleLabel(profile?.role)}
                </Typography>
              </Box>
              <DownOutlined
                style={{ color: platformTokens.header.muted, fontSize: 10, marginLeft: 7 }}
              />
            </Button>
          </Box>
        </Box>
      </Box>

      <Box
        component="nav"
        aria-label="Primary workspace navigation"
        sx={{
          height: WORKSPACE_NAV_HEIGHT,
          backgroundColor: platformTokens.navigation.background,
          borderBottom: `1px solid ${platformTokens.navigation.border}`,
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: "100%",
            maxWidth: `${WORKSPACE_MAX_WIDTH}px`,
            mx: "auto",
            px: { xs: 1.5, sm: 3, lg: 4.5 },
            display: "flex",
            alignItems: "center",
            gap: 0.7,
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 0.7 }}>
            {groupedNavigation.map((group) => {
              const active = group.routes.some((route) =>
                routeIsActive(location.pathname, route.route)
              );
              const GroupIcon = group.icon;
              const directRoute = group.routes.length === 1 ? group.routes[0] : null;

              return (
                <Button
                  key={group.key}
                  component={directRoute ? Link : "button"}
                  to={directRoute?.route}
                  onClick={
                    directRoute ? undefined : (event) => openNavigationMenu(event, group.key)
                  }
                  startIcon={<GroupIcon style={{ fontSize: 16 }} />}
                  endIcon={directRoute ? null : <DownOutlined style={{ fontSize: 9 }} />}
                  sx={{
                    height: 36,
                    px: 1.45,
                    borderRadius: "10px",
                    color: active
                      ? platformTokens.navigation.activeText
                      : platformTokens.navigation.text,
                    backgroundColor: active
                      ? platformTokens.navigation.activeBackground
                      : "transparent",
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 600,
                    textTransform: "none",
                    whiteSpace: "nowrap",
                    "&:hover": { backgroundColor: platformTokens.navigation.hoverBackground },
                  }}
                >
                  {group.label}
                </Button>
              );
            })}
          </Box>

          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 0.65 }}>
            {visibleRoutes.map((route) => {
              const active = routeIsActive(location.pathname, route.route);
              return (
                <Button
                  key={route.key}
                  component={Link}
                  to={route.route}
                  startIcon={route.icon}
                  sx={{
                    height: 36,
                    px: 1.2,
                    borderRadius: "10px",
                    color: active
                      ? platformTokens.navigation.activeText
                      : platformTokens.navigation.text,
                    backgroundColor: active
                      ? platformTokens.navigation.activeBackground
                      : "transparent",
                    fontSize: 12,
                    fontWeight: active ? 700 : 600,
                    textTransform: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {route.name}
                </Button>
              );
            })}
          </Box>
        </Box>
      </Box>

      <Menu
        anchorEl={navAnchor}
        open={Boolean(navAnchor)}
        onClose={closeNavigationMenu}
        PaperProps={{
          sx: {
            mt: 0.8,
            minWidth: 230,
            border: `1px solid ${platformTokens.surface.border}`,
            borderRadius: "12px",
            boxShadow: platformTokens.shadow.menu,
            overflow: "hidden",
          },
        }}
      >
        {openGroup?.routes.map((route) => (
          <MenuItem
            key={route.key}
            selected={routeIsActive(location.pathname, route.route)}
            onClick={() => {
              closeNavigationMenu();
              navigate(route.route);
            }}
            sx={{ gap: 1.2, py: 1.1, fontSize: 12.5 }}
          >
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                width: 20,
                color: platformTokens.brand.primary,
              }}
            >
              {route.icon}
            </Box>
            {route.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        PaperProps={{
          sx: {
            mt: 0.8,
            width: 340,
            maxWidth: "calc(100vw - 24px)",
            border: `1px solid ${platformTokens.surface.border}`,
            borderRadius: "12px",
            boxShadow: platformTokens.shadow.menu,
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setNotificationAnchor(null);
            navigate("/stock");
          }}
          sx={{ py: 1.25, gap: 1.2, whiteSpace: "normal" }}
        >
          <DatabaseOutlined style={{ color: platformTokens.brand.primary, fontSize: 17 }} />
          <Typography sx={{ fontSize: 12.3 }}>
            Review stock pressure and promotion coverage
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setNotificationAnchor(null);
            navigate("/campaigns");
          }}
          sx={{ py: 1.25, gap: 1.2, whiteSpace: "normal" }}
        >
          <BellOutlined style={{ color: platformTokens.brand.primary, fontSize: 17 }} />
          <Typography sx={{ fontSize: 12.3 }}>Check countries reached by stock emails</Typography>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        PaperProps={{
          sx: {
            mt: 0.8,
            minWidth: 220,
            border: `1px solid ${platformTokens.surface.border}`,
            borderRadius: "12px",
            boxShadow: platformTokens.shadow.menu,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
            {profile?.full_name || "Platform User"}
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: platformTokens.text.tertiary, mt: 0.25 }}>
            {roleLabel(profile?.role)}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setProfileAnchor(null);
            navigate("/account");
          }}
          sx={{ gap: 1.2, py: 1.1, fontSize: 12.5 }}
        >
          <UserOutlined /> Account
        </MenuItem>
        <MenuItem
          onClick={() => {
            setProfileAnchor(null);
            signOut();
          }}
          sx={{ gap: 1.2, py: 1.1, fontSize: 12.5, color: platformTokens.status.danger }}
        >
          <LogoutOutlined /> Sign out
        </MenuItem>
      </Menu>
    </AppBar>
  );
}
