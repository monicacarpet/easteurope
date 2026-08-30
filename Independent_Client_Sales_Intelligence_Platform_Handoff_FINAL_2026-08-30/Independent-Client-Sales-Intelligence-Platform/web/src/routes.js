import Icon from "@mui/material/Icon";
import Dashboard from "layouts/dashboard";
import Leads from "layouts/leads";
import MyLeads from "layouts/my-leads";
import FollowUps from "layouts/follow-ups";
import Stock from "layouts/stock";
import GIS from "layouts/gis";
import Campaigns from "layouts/campaigns";
import DataQuality from "layouts/data-quality";
import Reports from "layouts/reports";
import Activity from "layouts/activity";
import Admin from "layouts/admin";
import Account from "layouts/account";
import SignIn from "layouts/authentication/sign-in";

const analyticsRoles = ["ceo", "business_gm", "bi_admin", "bi_partial", "sales_manager"];
const adminRoles = ["ceo", "business_gm", "bi_admin"];

const routes = [
  {
    type: "collapse",
    name: "Dashboard",
    key: "dashboard",
    icon: <Icon fontSize="small">dashboard</Icon>,
    route: "/dashboard",
    component: <Dashboard />,
  },
  { type: "title", title: "Sales workspace", key: "sales-workspace" },
  {
    type: "collapse",
    name: "Lead Database",
    key: "leads",
    icon: <Icon fontSize="small">table_view</Icon>,
    route: "/leads",
    component: <Leads />,
  },
  {
    type: "collapse",
    name: "My Leads",
    key: "my-leads",
    icon: <Icon fontSize="small">work</Icon>,
    route: "/my-leads",
    component: <MyLeads />,
  },
  {
    type: "collapse",
    name: "Follow-ups",
    key: "follow-ups",
    icon: <Icon fontSize="small">event</Icon>,
    route: "/follow-ups",
    component: <FollowUps />,
  },
  {
    type: "title",
    title: "Inventory intelligence",
    key: "inventory-intelligence",
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Stock Portfolio",
    key: "stock",
    icon: <Icon fontSize="small">inventory_2</Icon>,
    route: "/stock",
    component: <Stock />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Promotion Campaigns",
    key: "campaigns",
    icon: <Icon fontSize="small">outgoing_mail</Icon>,
    route: "/campaigns",
    component: <Campaigns />,
    roles: analyticsRoles,
  },
  { type: "title", title: "Analysis & control", key: "analysis-control", roles: analyticsRoles },
  {
    type: "collapse",
    name: "GIS",
    key: "gis",
    icon: <Icon fontSize="small">map</Icon>,
    route: "/gis",
    component: <GIS />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Data Quality",
    key: "data-quality",
    icon: <Icon fontSize="small">fact_check</Icon>,
    route: "/data-quality",
    component: <DataQuality />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Reports",
    key: "reports",
    icon: <Icon fontSize="small">description</Icon>,
    route: "/reports",
    component: <Reports />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Activity",
    key: "activity",
    icon: <Icon fontSize="small">history</Icon>,
    route: "/activity",
    component: <Activity />,
  },
  {
    type: "collapse",
    name: "Administration",
    key: "admin",
    icon: <Icon fontSize="small">admin_panel_settings</Icon>,
    route: "/admin",
    component: <Admin />,
    roles: adminRoles,
  },
  { type: "divider", key: "account-divider" },
  {
    type: "collapse",
    name: "Account",
    key: "account",
    icon: <Icon fontSize="small">person</Icon>,
    route: "/account",
    component: <Account />,
  },
  {
    type: "hidden",
    key: "sign-in",
    route: "/authentication/sign-in",
    component: <SignIn />,
    public: true,
  },
];

export default routes;
