import { HEADER_HEIGHT, MANTIS_BREAKPOINTS, MINI_WIDTH, OPEN_WIDTH } from "config/mantisLayout";

test("uses the official Mantis drawer geometry", () => {
  expect(OPEN_WIDTH).toBe(260);
  expect(MINI_WIDTH).toBe(60);
  expect(HEADER_HEIGHT).toBe(60);
  expect(MANTIS_BREAKPOINTS).toMatchObject({ sm: 768, md: 1024, lg: 1266, xl: 1440 });
});
