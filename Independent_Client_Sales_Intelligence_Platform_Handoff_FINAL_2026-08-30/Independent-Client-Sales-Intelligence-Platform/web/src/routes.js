import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
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
    icon: <AppstoreOutlined style={{ fontSize: 17 }} />,
    route: "/dashboard",
    component: <Dashboard />,
  },
  { type: "title", title: "Sales workspace", key: "sales-workspace" },
  {
    type: "collapse",
    name: "Lead Database",
    key: "leads",
    icon: <BankOutlined style={{ fontSize: 17 }} />,
    route: "/leads",
    component: <Leads />,
  },
  {
    type: "collapse",
    name: "My Leads",
    key: "my-leads",
    icon: <TeamOutlined style={{ fontSize: 17 }} />,
    route: "/my-leads",
    component: <MyLeads />,
  },
  {
    type: "collapse",
    name: "Follow-ups",
    key: "follow-ups",
    icon: <CalendarOutlined style={{ fontSize: 17 }} />,
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
    icon: <DatabaseOutlined style={{ fontSize: 17 }} />,
    route: "/stock",
    component: <Stock />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Promotion Campaigns",
    key: "campaigns",
    icon: <SendOutlined style={{ fontSize: 17 }} />,
    route: "/campaigns",
    component: <Campaigns />,
    roles: analyticsRoles,
  },
  { type: "title", title: "Analysis & control", key: "analysis-control", roles: analyticsRoles },
  {
    type: "collapse",
    name: "GIS",
    key: "gis",
    icon: <EnvironmentOutlined style={{ fontSize: 17 }} />,
    route: "/gis",
    component: <GIS />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Data Quality",
    key: "data-quality",
    icon: <AuditOutlined style={{ fontSize: 17 }} />,
    route: "/data-quality",
    component: <DataQuality />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Reports",
    key: "reports",
    icon: <FileTextOutlined style={{ fontSize: 17 }} />,
    route: "/reports",
    component: <Reports />,
    roles: analyticsRoles,
  },
  {
    type: "collapse",
    name: "Activity",
    key: "activity",
    icon: <HistoryOutlined style={{ fontSize: 17 }} />,
    route: "/activity",
    component: <Activity />,
  },
  {
    type: "collapse",
    name: "Administration",
    key: "admin",
    icon: <SafetyCertificateOutlined style={{ fontSize: 17 }} />,
    route: "/admin",
    component: <Admin />,
    roles: adminRoles,
  },
  { type: "divider", key: "account-divider" },
  {
    type: "collapse",
    name: "Account",
    key: "account",
    icon: <UserOutlined style={{ fontSize: 17 }} />,
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
