import { useState } from "react";
import PropTypes from "prop-types";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { useMaterialUIController, setMiniSidenav } from "context";
import { useAuth } from "auth/AuthContext";
import platformTokens from "assets/theme/platformTokens";
import { APP_NAME } from "config/brand";

const PAGE_META = {
  "/dashboard": ["Dashboard", "Sales, stock and campaign intelligence"],
  "/leads": ["Lead Database", "Search, qualify and assign the Platform lead portfolio"],
  "/my-leads": ["My Leads", "Your claimed accounts and active sales work"],
  "/follow-ups": ["Follow-ups", "Open actions, due dates and sales commitments"],
  "/stock": ["Stock Portfolio", "Current inventory, readiness and stock pressure"],
  "/campaigns": ["Promotion Campaigns", "Outbound stock promotion activity and reach"],
  "/gis": ["GIS", "Geographic distribution of qualified sales opportunities"],
  "/data-quality": ["Data Quality", "Coverage, completeness and lead readiness controls"],
  "/activity": ["Activity", "Operational events across the Platform sales workflow"],
  "/admin": ["Administration", "Users, access and application controls"],
  "/reports": ["Reports", "Management-ready lead, campaign and stock reporting"],
  "/account": ["Account", "Profile and effective application permissions"],
};

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

export default function DashboardNavbar({ absolute = false, light = false, isMini = false }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const [openMenu, setOpenMenu] = useState(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, demoMode } = useAuth();
  const [title, subtitle] = PAGE_META[location.pathname] || [
    APP_NAME,
    "Internal sales intelligence",
  ];

  const handleMiniSidenav = () => setMiniSidenav(dispatch, !miniSidenav);

  function submitSearch(event) {
    event.preventDefault();
    const value = search.trim().toLowerCase();
    if (!value) return;
    if (value.includes("stock") || value.includes("inventory")) navigate("/stock");
    else if (value.includes("map") || value.includes("gis") || value.includes("country"))
      navigate("/gis");
    else if (value.includes("email") || value.includes("campaign")) navigate("/campaigns");
    else if (value.includes("follow")) navigate("/follow-ups");
    else navigate("/leads");
    setSearch("");
  }

  return (
    <AppBar
      position={absolute ? "absolute" : "static"}
      elevation={0}
      color="transparent"
      sx={{
        zIndex: 20,
        mb: 0.8,
        backgroundColor: "transparent",
        color: "inherit",
        boxShadow: "none",
        border: 0,
      }}
    >
      <Box
        sx={{
          minHeight: 58,
          px: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, gap: 1 }}>
          <IconButton
            size="small"
            onClick={handleMiniSidenav}
            sx={{
              display: { xs: "inline-flex", xl: "none" },
              width: 32,
              height: 32,
              color: platformTokens.text.secondary,
            }}
          >
            <MenuRoundedIcon sx={{ fontSize: 19 }} />
          </IconButton>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h5"
              sx={{
                color: platformTokens.text.primary,
                fontWeight: 700,
                fontSize: { xs: 19, md: 21 },
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: platformTokens.text.secondary,
                fontSize: 11.5,
                mt: 0.25,
                display: { xs: "none", sm: "block" },
              }}
            >
              {subtitle}
            </Typography>
          </Box>
        </Box>

        {isMini ? null : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.45 }}>
            <Box
              component="form"
              onSubmit={submitSearch}
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                width: searchFocused ? { md: 220, lg: 265 } : { md: 165, lg: 190 },
                height: 34,
                px: 0.55,
                borderBottom: `1px solid ${
                  searchFocused ? platformTokens.brand.primary : "transparent"
                }`,
                transition: "width 180ms ease, border-color 180ms ease",
                backgroundColor: "transparent",
              }}
            >
              <SearchRoundedIcon
                sx={{ fontSize: 18, color: platformTokens.text.secondary, mr: 0.55 }}
              />
              <InputBase
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search"
                fullWidth
                sx={{
                  fontSize: 11.8,
                  color: platformTokens.text.primary,
                  "& input::placeholder": { color: platformTokens.text.tertiary, opacity: 1 },
                }}
              />
            </Box>

            {demoMode ? (
              <Typography
                variant="caption"
                sx={{ color: platformTokens.status.warning, fontWeight: 700, mr: 0.4 }}
              >
                PREVIEW
              </Typography>
            ) : null}

            <Tooltip title="Notifications">
              <IconButton
                size="small"
                onClick={(event) => setOpenMenu(event.currentTarget)}
                sx={{
                  width: 32,
                  height: 32,
                  color: platformTokens.text.secondary,
                  "&:hover": { backgroundColor: platformTokens.surface.cardMuted },
                }}
              >
                <NotificationsNoneOutlinedIcon sx={{ fontSize: 18.5 }} />
              </IconButton>
            </Tooltip>

            <Box
              component={Link}
              to="/account"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.7,
                minHeight: 34,
                pl: 0.3,
                pr: 0.25,
                borderRadius: "9px",
                textDecoration: "none",
                "&:hover": { backgroundColor: platformTokens.surface.cardMuted },
              }}
            >
              <Avatar
                sx={{
                  width: 29,
                  height: 29,
                  bgcolor: platformTokens.brand.primary,
                  color: "white",
                  fontSize: 9.5,
                  fontWeight: 700,
                }}
              >
                {initials(profile?.full_name)}
              </Avatar>

              <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 86 }}>
                <Typography
                  sx={{
                    color: platformTokens.text.primary,
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.1,
                  }}
                >
                  {profile?.full_name || "Platform User"}
                </Typography>
                <Typography
                  sx={{
                    color: platformTokens.text.tertiary,
                    fontSize: 9.1,
                    mt: 0.25,
                    textTransform: "capitalize",
                  }}
                >
                  {roleLabel(profile?.role)}
                </Typography>
              </Box>

              <KeyboardArrowDownRoundedIcon
                sx={{
                  display: { xs: "none", lg: "block" },
                  fontSize: 15,
                  color: platformTokens.text.tertiary,
                }}
              />
            </Box>

            <Menu
              anchorEl={openMenu}
              open={Boolean(openMenu)}
              onClose={() => setOpenMenu(null)}
              PaperProps={{
                sx: {
                  mt: 1,
                  width: 340,
                  maxWidth: "calc(100vw - 24px)",
                  border: `1px solid ${platformTokens.surface.border}`,
                  boxShadow: platformTokens.shadow.menu,
                  borderRadius: "8px",
                  overflow: "hidden",
                },
              }}
            >
              <MenuItem
                onClick={() => {
                  setOpenMenu(null);
                  navigate("/stock");
                }}
                sx={{ py: 1.15, gap: 1.15, alignItems: "flex-start", whiteSpace: "normal" }}
              >
                <Inventory2OutlinedIcon
                  sx={{ fontSize: 18, color: platformTokens.text.secondary }}
                />
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  Review stock pressure and promotion coverage
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setOpenMenu(null);
                  navigate("/campaigns");
                }}
                sx={{ py: 1.15, gap: 1.15, alignItems: "flex-start", whiteSpace: "normal" }}
              >
                <CampaignOutlinedIcon sx={{ fontSize: 18, color: platformTokens.text.secondary }} />
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  Check countries reached by stock emails
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setOpenMenu(null);
                  navigate("/follow-ups");
                }}
                sx={{ py: 1.15, gap: 1.15, alignItems: "flex-start", whiteSpace: "normal" }}
              >
                <EventNoteOutlinedIcon
                  sx={{ fontSize: 18, color: platformTokens.text.secondary }}
                />
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  Complete overdue sales follow-ups
                </Typography>
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Box>
    </AppBar>
  );
}

DashboardNavbar.defaultProps = {
  absolute: false,
  light: false,
  isMini: false,
};

DashboardNavbar.propTypes = {
  absolute: PropTypes.bool,
  light: PropTypes.bool,
  isMini: PropTypes.bool,
};
