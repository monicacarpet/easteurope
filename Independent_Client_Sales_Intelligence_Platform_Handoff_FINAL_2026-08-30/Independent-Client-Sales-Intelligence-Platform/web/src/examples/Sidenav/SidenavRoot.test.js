import {
  WORKSPACE_HEADER_HEIGHT,
  WORKSPACE_MAX_WIDTH,
  WORKSPACE_NAV_HEIGHT,
  WORKSPACE_SHELL_HEIGHT,
} from "config/workspaceLayout";

test("uses a full-width top workspace with no sidebar offset", () => {
  expect(WORKSPACE_HEADER_HEIGHT).toBe(68);
  expect(WORKSPACE_NAV_HEIGHT).toBe(52);
  expect(WORKSPACE_SHELL_HEIGHT).toBe(120);
  expect(WORKSPACE_MAX_WIDTH).toBe(1720);
});
