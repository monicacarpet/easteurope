import { AppstoreOutlined, DownloadOutlined, UserOutlined } from "@ant-design/icons";
import { resolvePlatformIcon } from "components/Platform/PlatformIcon";

test("maps platform icon names to Ant Design icons", () => {
  expect(resolvePlatformIcon("download")).toBe(DownloadOutlined);
  expect(resolvePlatformIcon("person_outline")).toBe(UserOutlined);
  expect(resolvePlatformIcon("not-a-real-icon")).toBe(AppstoreOutlined);
});
