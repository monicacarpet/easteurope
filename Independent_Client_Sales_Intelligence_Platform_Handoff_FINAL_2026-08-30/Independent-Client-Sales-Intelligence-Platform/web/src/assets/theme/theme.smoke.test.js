import theme from "assets/theme";

test("initializes the Mantis theme without a startup exception", () => {
  expect(theme).toBeDefined();
  expect(theme.boxShadows.tabsBoxShadow.indicator).toBe("none");
});
