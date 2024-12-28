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

  const chartTypes = [
    {
      group: "Chart Types",
      items: ["line", "scatter"].map((x) => ({ id: x, name: x })),
    },
  ];

  const xAxisColumnChoices = [
    {
      group: "Column Names",
      items: valueHeaders?.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];

  const optionsWithToggle = [
    { name: "xAxisLog", title: "X-Axis Log Scale" },
    { name: "y1AxisLog", title: "Y1-Axis Log Scale" },
    { name: "y2AxisLog", title: "Y2-Axis Log Scale" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-clip">
      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Chart Config
      </h2>

      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="chartType"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Chart Type
          </label>
          <IdNameCombobox
            allItems={chartTypes}
            value={chartSettings.type}
            onSelectedItemChange={(v) => setChartSetting(sectionId, "type", v)}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="xAxisColumn"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            X-Axis Column
          </label>
          <IdNameCombobox
            allItems={xAxisColumnChoices}
            value={chartSettings.xAxisColumn}
            onSelectedItemChange={(v) =>
              setChartSetting(sectionId, "xAxisColumn", v)
            }
          />
        </div>

        {/* <div className="space-y-2">
          <label
            htmlFor="secondYAxisColumns"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Second Y-Axis Columns
          </label>
          <input
            id="secondYAxisColumns"
            type="text"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-blue-400"
            placeholder="Enter second y-axis columns"
            value={chartSettings.secondYAxisColumns}
            onChange={(e) =>
              setChartSetting(
                sectionId,
                "secondYAxisColumns",
                e.target.value.split(",").map((item) => item.trim()),
              )
            }
          />
        </div> */}

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
