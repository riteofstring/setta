import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import {
  setChartAreaDataPath,
  setChartSettings,
  setChartType,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useChartData, useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import {
  BaseChartSettingsUnion,
  ChartType,
  ChartTypeEnum,
  createBaseChartSettingsUnionWithDiscriminator,
  LineChartSettings,
  ScatterChartSettings,
  SectionTypeEnum,
} from "utils/generatedTypes";
export function ChartAreaSettings({ sectionId }: { sectionId: string }) {
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-scroll [&>*]:mr-[2px]">
      <ChartConfig sectionId={sectionId} />
    </div>
  );
}
function ChartConfig({ sectionId }: { sectionId: string }) {
  const { chartSettings, dataPath } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Chart,
    );
    return {
      chartSettings: impl.chartSettings,
      dataPath: impl.dataPath,
    };
  }, _.isEqual);
  const { valueHeaders, dataIsReady } = useChartData((x) => {
    if (x.x[dataPath]) {
      return {
        valueHeaders: Object.keys(x.x[dataPath].value),
        dataIsReady: true,
      };
    }
    return { valueHeaders: [], dataIsReady: false };
  });
  function onSetDataPath(newDataPath: string) {
    callOpenAPI(
      setChartAreaDataPath({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          dataPath: newDataPath,
        },
      } as Parameters<typeof setChartAreaDataPath>[0]),
    );
  }
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    dataPath,
    onSetDataPath,
    () => true,
    true,
  );
  return (
    <div className="flex flex-col gap-1">
      <h3 className="mt-1 font-bold text-setta-400 dark:text-setta-500">
        Chart Config
      </h3>
      <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
        Data Path
      </p>
      <input
        className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {dataIsReady && (
        <>
          <ChartTypeSelection
            sectionId={sectionId}
            selectedChartType={chartSettings.type}
          />
          <SpecificConfig
            sectionId={sectionId}
            chartSettings={chartSettings}
            valueHeaders={valueHeaders}
          />
        </>
      )}
    </div>
  );
}
function SpecificConfig({
  sectionId,
  chartSettings,
  valueHeaders,
}: {
  sectionId: string;
  chartSettings: BaseChartSettingsUnion;
  valueHeaders: Array<string>;
}) {
  switch (chartSettings.type) {
    case ChartTypeEnum.line:
      return (
        <LineChartConfig
          sectionId={sectionId}
          chartSettings={chartSettings}
          valueHeaders={valueHeaders}
        />
      );
    case ChartTypeEnum.scatter:
      return (
        <ScatterChartConfig
          sectionId={sectionId}
          chartSettings={chartSettings}
          valueHeaders={valueHeaders}
        />
      );
    default:
      return chartSettings satisfies never;
  }
}
// Helper type to get only boolean keys
type BooleanKeys<T> = {
  [K in keyof T]: T[K] extends boolean ? K : never;
}[keyof T] &
  string; // & string ensures we only get string keys
function LineChartConfig({
  sectionId,
  chartSettings,
  valueHeaders,
}: {
  sectionId: string;
  chartSettings: LineChartSettings;
  valueHeaders: Array<string>;
}) {
  const optionsWithToggle: Array<{
    name: BooleanKeys<LineChartSettings>;
    title: string;
  }> = [
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
        xAxisCanBeNull={true}
        chartType={ChartTypeEnum.line}
      />
      <TogglableOptions
        sectionId={sectionId}
        optionsWithToggle={optionsWithToggle}
        chartSettings={chartSettings}
        chartType={ChartTypeEnum.line}
      />
    </>
  );
}
function ScatterChartConfig({
  sectionId,
  chartSettings,
  valueHeaders,
}: {
  sectionId: string;
  chartSettings: ScatterChartSettings;
  valueHeaders: Array<string>;
}) {
  const optionsWithToggle: Array<{
    name: BooleanKeys<ScatterChartSettings>;
    title: string;
  }> = [
    { name: "xAxisLog", title: "X-Axis Log Scale" },
    { name: "yAxisLog", title: "Y1-Axis Log Scale" },
  ];
  return (
    <>
      <XAxisColumnSelection
        sectionId={sectionId}
        valueHeaders={valueHeaders}
        selectedXAxisColumn={chartSettings.xAxisColumn}
        xAxisCanBeNull={false}
        chartType={ChartTypeEnum.scatter}
      />
      <CategoryColumnSelection
        sectionId={sectionId}
        valueHeaders={valueHeaders}
        selectedCategoryColumn={chartSettings.categoryColumn}
        chartType={ChartTypeEnum.scatter}
      />
      <TogglableOptions
        sectionId={sectionId}
        optionsWithToggle={optionsWithToggle}
        chartSettings={chartSettings}
        chartType={ChartTypeEnum.scatter}
      />
    </>
  );
}
function ChartTypeSelection({
  sectionId,
  selectedChartType,
}: {
  sectionId: string;
  selectedChartType: ChartType;
}) {
  const chartTypes = [
    {
      group: "Chart Types",
      items: Object.values(ChartTypeEnum).map((x) => ({ id: x, name: x })),
    },
  ];
  return (
    <>
      <label
        htmlFor="chartType"
        className="block text-xs font-medium text-setta-700 dark:text-setta-300"
      >
        Chart Type
      </label>
      <IdNameCombobox
        allItems={chartTypes}
        value={selectedChartType}
        onSelectedItemChange={(v) => {
          if (v) {
            callOpenAPI(
              setChartType({
                body: {
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                  chartType: v,
                },
              } as Parameters<typeof setChartType>[0]),
            );
          }
        }}
      />
    </>
  );
}
function XAxisColumnSelection({
  sectionId,
  valueHeaders,
  selectedXAxisColumn,
  xAxisCanBeNull,
  chartType,
}: {
  sectionId: string;
  valueHeaders: Array<string>;
  selectedXAxisColumn: string | null;
  xAxisCanBeNull: boolean;
  chartType: ChartType;
}) {
  const xAxisColumnChoices = [
    {
      group: "Column Names",
      items: valueHeaders.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];
  return (
    <>
      <label
        htmlFor="xAxisColumn"
        className="block text-xs font-medium text-setta-700 dark:text-setta-300"
      >
        X-Axis Column
      </label>
      <IdNameCombobox
        allItems={xAxisColumnChoices}
        value={selectedXAxisColumn}
        onSelectedItemChange={(v) => {
          callOpenAPI(
            setChartSettings({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                chartSettings: createBaseChartSettingsUnionWithDiscriminator({
                  type: chartType,
                  xAxisColumn: v,
                }),
                changedSettings: ["xAxisColumn"],
              },
            } as Parameters<typeof setChartSettings>[0]),
          );
        }}
        selectedItemCanBeNull={xAxisCanBeNull}
      />
    </>
  );
}
function CategoryColumnSelection({
  sectionId,
  valueHeaders,
  selectedCategoryColumn,
  chartType,
}: {
  sectionId: string;
  valueHeaders: Array<string>;
  selectedCategoryColumn: string | null;
  chartType: ChartType;
}) {
  const categoryColumnChoices = [
    {
      group: "Column Names",
      items: valueHeaders.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];
  return (
    <>
      <label
        htmlFor="categoryColumn"
        className="block text-xs font-medium text-setta-700 dark:text-setta-300"
      >
        Category Column
      </label>
      <IdNameCombobox
        allItems={categoryColumnChoices}
        value={selectedCategoryColumn}
        onSelectedItemChange={(v) =>
          callOpenAPI(
            setChartSettings({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                chartSettings: createBaseChartSettingsUnionWithDiscriminator({
                  type: chartType,
                  categoryColumn: v,
                }),
                changedSettings: ["categoryColumn"],
              },
            } as Parameters<typeof setChartSettings>[0]),
          )
        }
      />
    </>
  );
}
function TogglableOptions<T extends BaseChartSettingsUnion>({
  sectionId,
  optionsWithToggle,
  chartSettings,
  chartType,
}: {
  sectionId: string;
  optionsWithToggle: Array<{
    name: BooleanKeys<T>; // Only keys where value is boolean
    title: string;
  }>;
  chartSettings: T;
  chartType: ChartType;
}) {
  return (
    <div className="flex flex-col gap-2 py-6">
      <h4 className="font-semibold text-setta-400 dark:text-setta-400">
        Chart Labels
      </h4>
      {optionsWithToggle.map((x) => {
        const value = chartSettings[x.name];
        if (typeof value !== "boolean") {
          throw new Error(`Expected boolean for ${x.name}`);
        }
        return (
          <ChartConfigToggle
            key={x.name}
            sectionId={sectionId}
            name={x.name}
            title={x.title}
            value={value}
            chartType={chartType}
          />
        );
      })}
    </div>
  );
}
function ChartConfigToggle({
  sectionId,
  name,
  value,
  title,
  chartType,
}: {
  sectionId: string;
  name: string;
  value: boolean;
  title: string;
  chartType: ChartType;
}) {
  return (
    <div className="flex items-center justify-between">
      <label
        htmlFor={name}
        className="cursor-pointer text-xs font-medium text-setta-700 dark:text-setta-300"
      >
        {title}
      </label>
      <input
        type="checkbox"
        id={name}
        className="h-4 w-4 cursor-pointer rounded bg-setta-500/50  text-blue-500 outline outline-offset-2 outline-transparent checked:bg-blue-500 focus-visible:!outline-blue-500 dark:text-blue-400 dark:focus-visible:ring-blue-400"
        checked={value}
        onChange={(e) =>
          callOpenAPI(
            setChartSettings({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                chartSettings: createBaseChartSettingsUnionWithDiscriminator({
                  type: chartType,
                  [name]: e.target.checked,
                }),
                changedSettings: [name],
              },
            } as Parameters<typeof setChartSettings>[0]),
          )
        }
      />
    </div>
  );
}
