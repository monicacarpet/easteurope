/* eslint-disable react/prop-types */
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      Link: React.forwardRef(function MockLink({ children, to, ...rest }, ref) {
        return React.createElement("a", { ...rest, ref, href: to }, children);
      }),
      useLocation: () => ({ pathname: "/dashboard" }),
      useNavigate: () => jest.fn(),
    };
  },
  { virtual: true }
);

jest.mock("auth/AuthContext", () => ({
  useAuth: () => ({
    profile: { full_name: "Test User", role: "ceo" },
    demoMode: false,
    signOut: jest.fn(),
  }),
}));

jest.mock("routes", () => {
  const React = require("react");
  return [
    {
      type: "collapse",
      name: "Dashboard",
      key: "dashboard",
      route: "/dashboard",
      icon: React.createElement("span", { "data-route-icon": "dashboard" }),
    },
    {
      type: "collapse",
      name: "Lead Database",
      key: "leads",
      route: "/leads",
      icon: React.createElement("span", { "data-route-icon": "leads" }),
    },
    {
      type: "collapse",
      name: "Account",
      key: "account",
      route: "/account",
      icon: React.createElement("span", { "data-route-icon": "account" }),
    },
  ];
});

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = false;
});

test("renders horizontal workspace navigation without a sidebar", async () => {
  document.body.innerHTML = '<div id="test-root"></div>';
  const root = createRoot(document.getElementById("test-root"));

  await act(async () => {
    root.render(<DashboardNavbar />);
  });

  expect(document.querySelector('nav[aria-label="Primary workspace navigation"]')).toBeTruthy();
  expect(document.body.textContent).toContain("Overview");
  expect(document.querySelector(".MuiDrawer-root")).toBeNull();
  expect(document.querySelector("[data-route-icon='dashboard']")).toBeTruthy();

  await act(async () => root.unmount());
});
