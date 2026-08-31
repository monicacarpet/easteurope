import { Chart as ChartJS } from "chart.js";
import { LANGUAGE_KEY, translateValue } from "components/Platform/LanguageSwitcher";

function currentLanguage() {
  return window.localStorage.getItem(LANGUAGE_KEY) === "zh" ? "zh" : "en";
}

function translateLabel(label, language) {
  if (Array.isArray(label)) return label.map((part) => translateLabel(part, language));
  return typeof label === "string" ? translateValue(label, language) : label;
}

function translateOptionText(option, language) {
  if (!option || typeof option !== "object") return;
  if (Object.prototype.hasOwnProperty.call(option, "text")) {
    option.text = translateLabel(option.text, language);
  }
}

export function localizeChart(chart, language = currentLanguage()) {
  if (Array.isArray(chart.data?.labels)) {
    chart.data.labels = chart.data.labels.map((label) => translateLabel(label, language));
  }

  chart.data?.datasets?.forEach((dataset) => {
    if (typeof dataset.label === "string") {
      dataset.label = translateValue(dataset.label, language);
    }
  });

  translateOptionText(chart.options?.plugins?.title, language);
  translateOptionText(chart.options?.plugins?.subtitle, language);

  Object.values(chart.options?.scales || {}).forEach((scale) => {
    translateOptionText(scale?.title, language);
  });
}

const platformLocalizationPlugin = {
  id: "platform-localization",
  beforeUpdate(chart) {
    localizeChart(chart);
  },
};

ChartJS.register(platformLocalizationPlugin);

window.addEventListener("platform-language-change", () => {
  Object.values(ChartJS.instances || {}).forEach((chart) => chart.update());
});
