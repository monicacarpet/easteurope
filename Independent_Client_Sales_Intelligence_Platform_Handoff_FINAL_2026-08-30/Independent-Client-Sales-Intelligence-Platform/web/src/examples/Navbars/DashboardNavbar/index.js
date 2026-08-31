import { useState } from "react";
import PropTypes from "prop-types";
import { Link, useNavigate } from "react-router-dom";
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
import { OPEN_WIDTH, MINI_WIDTH } from "examples/Sidenav/SidenavRoot";
import { HEADER_HEIGHT } from "examples/LayoutContainers/DashboardLayout";

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

export default function DashboardNavbar({ isMini = false }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const [openMenu, setOpenMenu] = useState(null);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { profile, demoMode } = useAuth();
  const sidebarWidth = miniSidenav ? MINI_WIDTH : OPEN_WIDTH;

  const handleSidenav = () => setMiniSidenav(dispatch, !miniSidenav);

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
      position="fixed"
      elevation={0}
      color="transparent"
      sx={({ breakpoints, transitions }) => ({
        zIndex: 1250,
        top: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: HEADER_HEIGHT,
        backgroundColor: "rgba(255,255,255,0.98)",
        color: platformTokens.text.primary,
        borderBottom: `1px solid ${platformTokens.surface.border}`,
        boxShadow: "none",
        backdropFilter: "blur(8px)",
        transition: transitions.create(["left", "width"], {
          easing: transitions.easing.sharp,
          duration: transitions.duration.shorter,
        }),

        [breakpoints.up("xl")]: {
          left: `${sidebarWidth}px`,
          width: `calc(100% - ${sidebarWidth}px)`,
        },
      })}
    >
      <Box
        sx={{
          height: HEADER_HEIGHT,
          px: { xs: 1.5, sm: 2, md: 2.5 },
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, gap: 1.25, flex: 1 }}>
          <IconButton
            size="small"
            onClick={handleSidenav}
            sx={{
              width: 34,
              height: 34,
              color: platformTokens.text.secondary,
              borderRadius: "6px",
              "&:hover": { backgroundColor: platformTokens.surface.cardMuted },
            }}
          >
            <MenuRoundedIcon sx={{ fontSize: 19 }} />
          </IconButton>

          {isMini ? null : (
            <Box
              component="form"
              onSubmit={submitSearch}
              sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                width: { sm: 220, md: 270 },
                height: 36,
                px: 1.1,
                border: `1px solid ${platformTokens.surface.borderStrong}`,
                borderRadius: "6px",
                backgroundColor: "#FFFFFF",
                transition: "border-color 140ms ease, box-shadow 140ms ease",
                "&:focus-within": {
                  borderColor: platformTokens.brand.primary,
                  boxShadow: "0 0 0 2px rgba(22,119,255,.10)",
                },
              }}
            >
              <SearchRoundedIcon
                sx={{ fontSize: 18, color: platformTokens.text.tertiary, mr: 0.75 }}
              />
              <InputBase
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                fullWidth
                sx={{
                  fontSize: 12.5,
                  color: platformTokens.text.primary,
                  "& input::placeholder": { color: platformTokens.text.tertiary, opacity: 1 },
                }}
              />
            </Box>
          )}
        </Box>

        {isMini ? null : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.55 }}>
            {demoMode ? (
              <Typography
                variant="caption"
                sx={{ color: platformTokens.status.warning, fontWeight: 600, mr: 0.5 }}
              >
                PREVIEW
              </Typography>
            ) : null}

            <Tooltip title="Notifications">
              <IconButton
                size="small"
                onClick={(event) => setOpenMenu(event.currentTarget)}
                sx={{
                  width: 34,
                  height: 34,
                  color: platformTokens.text.secondary,
                  borderRadius: "6px",
                  "&:hover": { backgroundColor: platformTokens.surface.cardMuted },
                }}
              >
                <NotificationsNoneOutlinedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </Tooltip>

            <Box
              component={Link}
              to="/account"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.8,
                minHeight: 38,
                pl: 0.45,
                pr: 0.7,
                borderRadius: "6px",
                textDecoration: "none",
                "&:hover": { backgroundColor: platformTokens.surface.cardMuted },
              }}
            >
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: platformTokens.brand.primarySoft,
                  color: platformTokens.brand.primary,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {initials(profile?.full_name)}
              </Avatar>

              <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 86 }}>
                <Typography
                  sx={{
                    color: platformTokens.text.primary,
                    fontSize: 11.5,
                    fontWeight: 500,
                    lineHeight: 1.15,
                  }}
                >
                  {profile?.full_name || "Platform User"}
                </Typography>
                <Typography
                  sx={{
                    color: platformTokens.text.tertiary,
                    fontSize: 9.5,
                    mt: 0.2,
                    textTransform: "capitalize",
                  }}
                >
                  {roleLabel(profile?.role)}
                </Typography>
              </Box>

              <KeyboardArrowDownRoundedIcon
                sx={{
                  display: { xs: "none", lg: "block" },
                  fontSize: 16,
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
                  width: 330,
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
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45 }}>
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
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45 }}>
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
                <Typography sx={{ fontSize: 12.3, lineHeight: 1.45 }}>
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

DashboardNavbar.defaultProps = { absolute: false, light: false, isMini: false };
DashboardNavbar.propTypes = {
  absolute: PropTypes.bool,
  light: PropTypes.bool,
  isMini: PropTypes.bool,
};
