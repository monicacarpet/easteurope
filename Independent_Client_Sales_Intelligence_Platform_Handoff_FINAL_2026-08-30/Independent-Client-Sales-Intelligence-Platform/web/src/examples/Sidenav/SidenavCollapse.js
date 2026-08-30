import PropTypes from "prop-types";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MDBox from "components/MDBox";
import { useMaterialUIController } from "context";
import platformTokens from "assets/theme/platformTokens";

function SidenavCollapse({ icon, name, active, ...rest }) {
  const [controller] = useMaterialUIController();
  const { miniSidenav } = controller;

  return (
    <ListItem disablePadding component="li" sx={{ display: "block" }}>
      <MDBox
        {...rest}
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: miniSidenav ? "center" : "flex-start",
          width: "auto",
          minHeight: 40,
          mx: miniSidenav ? 1 : 1.25,
          mb: 0.35,
          px: miniSidenav ? 0.8 : 1.15,
          borderRadius: "9px",
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          color: active ? platformTokens.sidebar.activeText : platformTokens.sidebar.muted,
          backgroundColor: active ? platformTokens.sidebar.activeBackground : "transparent",
          transition: "background-color 140ms ease, color 140ms ease",

          "&::before": active
            ? {
                content: '""',
                position: "absolute",
                left: -10,
                top: 8,
                bottom: 8,
                width: 3,
                borderRadius: "0 3px 3px 0",
                backgroundColor: platformTokens.brand.accent,
              }
            : undefined,

          "&:hover": {
            backgroundColor: active
              ? platformTokens.sidebar.activeBackground
              : platformTokens.sidebar.hoverBackground,
            color: platformTokens.sidebar.text,
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: miniSidenav ? 0 : 29,
            width: 20,
            height: 20,
            mr: miniSidenav ? 0 : 0.75,
            display: "grid",
            placeItems: "center",
            color: active ? platformTokens.brand.accent : platformTokens.sidebar.muted,
            transition: "color 140ms ease",

            "& .MuiIcon-root": {
              width: 18,
              height: 18,
              fontSize: "18px !important",
              lineHeight: 1,
              overflow: "visible",
            },
          }}
        >
          {icon}
        </ListItemIcon>

        <ListItemText
          primary={name}
          sx={{
            display: miniSidenav ? "none" : "block",
            m: 0,
            minWidth: 0,

            "& .MuiListItemText-primary": {
              color: "inherit",
              fontSize: 12.5,
              lineHeight: 1.25,
              fontWeight: active ? 650 : 500,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          }}
        />
      </MDBox>
    </ListItem>
  );
}

SidenavCollapse.defaultProps = {
  active: false,
};

SidenavCollapse.propTypes = {
  icon: PropTypes.node.isRequired,
  name: PropTypes.string.isRequired,
  active: PropTypes.bool,
};

export default SidenavCollapse;
