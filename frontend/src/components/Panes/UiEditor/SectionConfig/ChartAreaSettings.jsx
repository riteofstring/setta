import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ChartAreaSettings({ sectionId }) {
  return (
    <>
      <ChartConfig sectionId={sectionId} />
      <JustListOfArtifacts sectionId={sectionId} sectionTypeName={C.CHART} />
    </>
  );
}

function ChartConfig({ sectionId }) {
  const chartSettings = useSectionInfos(
    (x) => x.x[sectionId].chartSettings,
    _.isEqual,
  );

  const valueHeaders = Object.values(
    useAllSectionArtifacts(sectionId, ["value.headers"]),
  )[0]?.value?.headers;

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Chart Config
      </h2>
      <ChartTypeSelection
        sectionId={sectionId}
        selectedChartType={chartSettings.type}
      />
      <SpecificConfig
        sectionId={sectionId}
        chartSettings={chartSettings}
        valueHeaders={valueHeaders}
      />
    </div>
  );
}

function SpecificConfig({ sectionId, chartSettings, valueHeaders }) {
  switch (chartSettings.type) {
    case "line":
      return (
        <LineChartConfig
          sectionId={sectionId}
          chartSettings={chartSettings}
          valueHeaders={valueHeaders}
        />
      );
    case "scatter":
      return (
        <ScatterChartConfig
          sectionId={sectionId}
          chartSettings={chartSettings}
          valueHeaders={valueHeaders}
        />
      );
    default:
      return null;
  }
}

function LineChartConfig({ sectionId, chartSettings, valueHeaders }) {
  const optionsWithToggle = [
    { name: "xAxisLog", title: "X-Axis Log Scale" },
    { name: "y1AxisLog", title: "Y1-Axis Log Scale" },
    { name: "y2AxisLog", title: "Y2-Axis Log Scale" },
  ];

  return (
    <>
      <XAxisColumnSelection
        sectionId={sectionId}
        valueHeaders={valueHeaders}
        selectedXAxisColumn={chartSettings.xAxisColumn}
      />
      <TogglableOptions
        sectionId={sectionId}
        optionsWithToggle={optionsWithToggle}
        chartSettings={chartSettings}
      />
    </>
  );
}

function ScatterChartConfig({ sectionId, chartSettings, valueHeaders }) {
  const optionsWithToggle = [
    { name: "xAxisLog", title: "X-Axis Log Scale" },
    { name: "y1AxisLog", title: "Y1-Axis Log Scale" },
    { name: "y2AxisLog", title: "Y2-Axis Log Scale" },
  ];

  return (
    <>
      <XAxisColumnSelection
        sectionId={sectionId}
        valueHeaders={valueHeaders}
        selectedXAxisColumn={chartSettings.xAxisColumn}
      />
      <CategoryColumnSelection
        sectionId={sectionId}
        valueHeaders={valueHeaders}
        selectedCategoryColumn={chartSettings.categoryColumn}
      />
      <TogglableOptions
        sectionId={sectionId}
        optionsWithToggle={optionsWithToggle}
        chartSettings={chartSettings}
      />
    </>
  );
}

function ChartTypeSelection({ sectionId, selectedChartType }) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="chartType"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Chart Type
      </label>
      <IdNameCombobox
        allItems={chartTypes}
        value={selectedChartType}
        onSelectedItemChange={(v) => setChartSetting(sectionId, "type", v)}
      />
    </div>
  );
}

function XAxisColumnSelection({
  sectionId,
  valueHeaders,
  selectedXAxisColumn,
}) {
  const xAxisColumnChoices = [
    {
      group: "Column Names",
      items: valueHeaders?.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];

  return (
    <div className="space-y-2">
      <label
        htmlFor="xAxisColumn"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        X-Axis Column
      </label>
      <IdNameCombobox
        allItems={xAxisColumnChoices}
        value={selectedXAxisColumn}
        onSelectedItemChange={(v) =>
          setChartSetting(sectionId, "xAxisColumn", v)
        }
      />
    </div>
  );
}

function CategoryColumnSelection({
  sectionId,
  valueHeaders,
  selectedCategoryColumn,
}) {
  const categoryColumnChoices = [
    {
      group: "Column Names",
      items: valueHeaders?.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];

  return (
    <div className="space-y-2">
      <label
        htmlFor="categoryColumn"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Category Column
      </label>
      <IdNameCombobox
        allItems={categoryColumnChoices}
        value={selectedCategoryColumn}
        onSelectedItemChange={(v) =>
          setChartSetting(sectionId, "categoryColumn", v)
        }
      />
    </div>
  );
}

function TogglableOptions({ sectionId, optionsWithToggle, chartSettings }) {
  return (
    <div className="space-y-4">
      {optionsWithToggle.map((x) => (
        <ChartConfigToggle
          key={`${x.name}`}
          sectionId={sectionId}
          name={x.name}
          title={x.title}
          value={chartSettings[x.name]}
        />
      ))}
    </div>
  );
}

function ChartConfigToggle({ sectionId, name, value, title }) {
  return (
    <div className="flex items-center justify-between">
      <label
        htmlFor={name}
        className="text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {title}
      </label>
      <input
        type="checkbox"
        id={name}
        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:text-blue-400 dark:focus:ring-blue-400"
        checked={value}
        onChange={(e) => setChartSetting(sectionId, name, e.target.checked)}
      />
    </div>
  );
}

function setChartSetting(sectionId, name, value) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].chartSettings[name] = value;
  });
}

const chartTypes = [
  {
    group: "Chart Types",
    items: ["line", "scatter"].map((x) => ({ id: x, name: x })),
  },
];
