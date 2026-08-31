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
          display: "flex",
          alignItems: "center",
          justifyContent: miniSidenav ? "center" : "flex-start",
          minHeight: 40,
          mx: 1.25,
          mb: 0.35,
          px: miniSidenav ? 1 : 1.35,
          borderRadius: "6px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          color: active ? platformTokens.sidebar.activeText : platformTokens.sidebar.text,
          backgroundColor: active ? platformTokens.sidebar.activeBackground : "transparent",
          transition: "background-color 140ms ease, color 140ms ease",
          "&:hover": {
            color: active ? platformTokens.sidebar.activeText : platformTokens.sidebar.text,
            backgroundColor: active
              ? platformTokens.sidebar.activeBackground
              : platformTokens.sidebar.hoverBackground,
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: miniSidenav ? 0 : 32,
            width: 20,
            height: 20,
            mr: miniSidenav ? 0 : 0.8,
            display: "grid",
            placeItems: "center",
            color: active ? platformTokens.sidebar.activeText : platformTokens.sidebar.muted,
            "& .MuiIcon-root": {
              width: 19,
              height: 19,
              fontSize: "19px !important",
              lineHeight: 1,
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
              fontSize: 13,
              lineHeight: 1.3,
              fontWeight: active ? 500 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          }}
        />
      </MDBox>
    </ListItem>
  );
}

SidenavCollapse.defaultProps = { active: false };
SidenavCollapse.propTypes = {
  icon: PropTypes.node.isRequired,
  name: PropTypes.string.isRequired,
  active: PropTypes.bool,
};

export default SidenavCollapse;
