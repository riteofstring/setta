import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import C from "constants/constants.json";
import React from "react";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ChartAreaSettings({ sectionId }) {
  return (
    <>
      <ChartConfig />
      <JustListOfArtifacts sectionId={sectionId} sectionTypeName={C.CHART} />
    </>
  );
}

function ChartConfig() {
  const [chartType, setChartType] = React.useState("line");
  const [xAxisLog, setXAxisLog] = React.useState(false);
  const [y1AxisLog, setY1AxisLog] = React.useState(false);
  const [y2AxisLog, setY2AxisLog] = React.useState(false);

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
            allItems={[
              {
                group: "Chart Types",
                items: [
                  { id: "line", name: "line" },
                  { id: "scatter", name: "scatter" },
                ],
              },
            ]}
            value={chartType}
            onSelectedItemChange={setChartType}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="xAxisColumn"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            X-Axis Column
          </label>
          <input
            id="xAxisColumn"
            type="text"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-blue-400"
            placeholder="Enter x-axis column"
          />
        </div>

        <div className="space-y-2">
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
          />
        </div>

        <div className="flex items-center justify-between">
          <label
            htmlFor="xAxisLog"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            X-Axis Log Scale
          </label>
          <input
            type="checkbox"
            id="xAxisLog"
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:text-blue-400 dark:focus:ring-blue-400"
            checked={xAxisLog}
            onChange={(e) => setXAxisLog(e.target.checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <label
            htmlFor="y1AxisLog"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Y1-Axis Log Scale
          </label>
          <input
            type="checkbox"
            id="y1AxisLog"
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:text-blue-400 dark:focus:ring-blue-400"
            checked={y1AxisLog}
            onChange={(e) => setY1AxisLog(e.target.checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <label
            htmlFor="y2AxisLog"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Y2-Axis Log Scale
          </label>
          <input
            type="checkbox"
            id="y2AxisLog"
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:text-blue-400 dark:focus:ring-blue-400"
            checked={y2AxisLog}
            onChange={(e) => setY2AxisLog(e.target.checked)}
          />
        </div>
      </div>
    </div>
  );
}
