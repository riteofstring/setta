import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { updateColumnNameSelections } from "state/actions/artifacts";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useChartData, useProjectState } from "state/definitions";
import { getAllSectionArtifactIds } from "state/hooks/artifacts";
import { route_set_chart_type } from "utils/generatedEndpoints";
import {
  BaseChartSettingsUnion,
  ChartType,
  ChartTypeEnum,
  LineChartSettings,
  ScatterChartSettings,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function ChartAreaSettings({ sectionId }: { sectionId: string }) {
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-scroll [&>*]:mr-[2px]">
      <ChartConfig sectionId={sectionId} />
      {/* <JustListOfArtifacts
        sectionId={sectionId}
        sectionTypeName={UITypeNameEnum.CHART}
      /> */}
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

  const valueHeaders = useChartData((x) => {
    if (x.x[dataPath]) {
      return Object.keys(x.x[dataPath]);
    }
    return [];
  });

  return (
    <div className="flex flex-col gap-1">
      <h3 className="mt-1 font-bold text-setta-400 dark:text-setta-500">
        Chart Config
      </h3>
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
      />
      <TogglableOptions
        sectionId={sectionId}
        optionsWithToggle={optionsWithToggle}
        chartSettings={chartSettings}
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

function ChartTypeSelection({
  sectionId,
  selectedChartType,
}: {
  sectionId: string;
  selectedChartType: ChartType;
}) {
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
        onSelectedItemChange={(v: ChartType) =>
          route_set_chart_type({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            chartType: v,
          })
        }
      />
    </>
  );
}

function XAxisColumnSelection({
  sectionId,
  valueHeaders,
  selectedXAxisColumn,
  xAxisCanBeNull,
}: {
  sectionId: string;
  valueHeaders: Array<string>;
  selectedXAxisColumn: string | null;
  xAxisCanBeNull: boolean;
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
        onSelectedItemChange={(v) =>
          setChartSetting(sectionId, "xAxisColumn", v)
        }
        selectedItemCanBeNull={xAxisCanBeNull}
      />
    </>
  );
}

function CategoryColumnSelection({
  sectionId,
  valueHeaders,
  selectedCategoryColumn,
}: {
  sectionId: string;
  valueHeaders: Array<string>;
  selectedCategoryColumn: string | null;
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
          setChartSetting(sectionId, "categoryColumn", v)
        }
      />
    </>
  );
}

function TogglableOptions<T extends BaseChartSettingsUnion>({
  sectionId,
  optionsWithToggle,
  chartSettings,
}: {
  sectionId: string;
  optionsWithToggle: Array<{
    name: BooleanKeys<T>; // Only keys where value is boolean
    title: string;
  }>;
  chartSettings: T;
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
}: {
  sectionId: string;
  name: string;
  value: boolean;
  title: string;
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
        onChange={(e) => setChartSetting(sectionId, name, e.target.checked)}
      />
    </div>
  );
}

function setChartSetting(sectionId, name, value) {
  useProjectState.setState((state) => {
    state.sections[sectionId].chartSettings[name] = value;
  });
}

function setChartType(sectionId, chartType) {
  useProjectState.setState((state) => {
    state.sections[sectionId].chartSettings.type = chartType;
    const artifactIds = getAllSectionArtifactIds(sectionId, state);
    updateColumnNameSelections(Array.from(artifactIds), sectionId, state);
  });
}

const chartTypes = [
  {
    group: "Chart Types",
    items: ["line", "scatter"].map((x) => ({ id: x, name: x })),
  },
];
