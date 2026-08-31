import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import LanguageSwitcher, {
  LANGUAGE_KEY,
  translateTree,
  translateValue,
} from "components/Platform/LanguageSwitcher";

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = false;
});

test("translates interface and standardized Supabase values", () => {
  expect(translateValue("Lead database", "zh")).toBe("客户线索库");
  expect(translateValue("promotional_ready", "zh")).toBe("可推广");
  expect(translateValue("France", "zh")).toBe("法国");
  expect(translateValue("12 records match the current filters", "zh")).toBe(
    "12 条记录符合当前筛选条件"
  );
});

test("switches standardized values back to English", () => {
  expect(translateValue("客户线索库", "en")).toBe("Lead database");
  expect(translateValue("法国", "en")).toBe("France");
});

test("keeps Material Icons ligatures intact while translating nearby text", () => {
  document.body.innerHTML = '<span class="MuiIcon-root">close</span><span>Close</span>';

  translateTree(document.body, "zh");

  expect(document.querySelector(".MuiIcon-root").textContent).toBe("close");
  expect(document.body.lastElementChild.textContent).toBe("关闭");
});

test("changes the live interface when Chinese is selected", async () => {
  window.localStorage.removeItem(LANGUAGE_KEY);
  document.body.innerHTML = '<div id="test-root"></div><span>Dashboard</span>';
  const root = createRoot(document.getElementById("test-root"));

  await act(async () => {
    root.render(<LanguageSwitcher inline />);
  });

  await act(async () => {
    document
      .querySelector('button[aria-label="Open language selector"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const chineseItem = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent.trim() === "中文"
  );
  expect(chineseItem).toBeTruthy();

  await act(async () => {
    chineseItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe("zh");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(document.body.textContent).toContain("仪表盘");

  await act(async () => root.unmount());
});
