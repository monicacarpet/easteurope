import theme from "assets/theme";

test("initializes the independent workspace theme without a startup exception", () => {
  expect(theme).toBeDefined();
  expect(theme.boxShadows.tabsBoxShadow.indicator).toBe("none");
});
