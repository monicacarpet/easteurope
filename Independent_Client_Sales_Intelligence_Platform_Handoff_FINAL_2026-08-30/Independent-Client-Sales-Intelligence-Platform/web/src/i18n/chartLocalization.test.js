import { localizeChart } from "i18n/chartLocalization";

test("localizes chart labels sourced from Supabase and restores English", () => {
  const chart = {
    data: {
      labels: ["France", "promotional_ready"],
      datasets: [{ label: "Lead campaign", data: [3, 7] }],
    },
    options: {
      plugins: { title: { text: "Daily reach" } },
      scales: { x: { title: { text: "Country" } } },
    },
  };

  localizeChart(chart, "zh");

  expect(chart.data.labels).toEqual(["法国", "可推广"]);
  expect(chart.data.datasets[0].label).toBe("客户开发推广");
  expect(chart.options.plugins.title.text).toBe("每日触达");
  expect(chart.options.scales.x.title.text).toBe("国家");

  localizeChart(chart, "en");
  expect(chart.data.labels).toEqual(["France", "promotional_ready"]);
  expect(chart.data.datasets[0].label).toBe("Lead campaign");
});
