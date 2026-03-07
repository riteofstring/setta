import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import _ from "lodash";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

type BenchmarkParamRow = {
  depth: number;
  id: string;
  isParent: boolean;
  label: string;
};

export function SettingsAllSettingsBenchmarkDictArea({
  sectionId,
  bgColor,
}: {
  sectionId: string;
  bgColor: string;
}) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const {
    inputPortCount,
    outputPortCount,
    pinnedRows,
    unpinnedRows,
    hideUnpinnedParams,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    const toRows = (
      topLevelParamIds: Array<string>,
      requiredParamIdsToPaths: Record<string, Array<string>>,
    ): Array<BenchmarkParamRow> => {
      if (topLevelParamIds.length === 0) {
        return [];
      }
      const tree = buildParamTreeView(
        state,
        sectionId,
        topLevelParamIds,
        requiredParamIdsToPaths,
      );
      return tree.flat.map((item) => ({
        depth: item.depth,
        id: item.id,
        isParent: item.isParent,
        label: getParamDisplayName(state, sectionId, item.id),
      }));
    };

    return {
      inputPortCount: impl.edgeInputParams.length,
      outputPortCount: impl.edgeOutputPorts.length,
      pinnedRows: toRows(
        pinned.topLevelParamIds,
        pinned.requiredParamIdsToPaths,
      ),
      unpinnedRows: impl.hideUnpinnedParams
        ? []
        : toRows(unpinned.topLevelParamIds, unpinned.requiredParamIdsToPaths),
      hideUnpinnedParams: impl.hideUnpinnedParams,
    };
  }, _.isEqual);

  return (
    <section
      className="section-row-pin-main relative -mt-3 flex min-h-0 flex-col pt-2"
      data-settings-benchmark-dict-area={benchmark.stage}
    >
      <section
        className={`section-w-full rounded-lg border border-dashed border-setta-200 px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-setta-400 dark:border-setta-700 dark:text-setta-500 ${bgColor}`}
        data-settings-benchmark-shell="toolbar"
      >
        Benchmark shell
      </section>
      <section
        className={`section-w-full mt-2 rounded-lg border border-dashed border-setta-200 px-3 py-2 text-[0.65rem] text-setta-500 dark:border-setta-700 dark:text-setta-400 ${bgColor}`}
        data-settings-benchmark-shell="edges"
      >
        <div className="flex items-center justify-between gap-4">
          <span>Inputs: {inputPortCount}</span>
          <span>Outputs: {outputPortCount}</span>
        </div>
      </section>
      <BenchmarkParamArea
        title="Pinned Params"
        rows={pinnedRows}
        renderRows={benchmark.renderStaticParamList}
      />
      {!hideUnpinnedParams && (
        <BenchmarkParamArea
          title="Params"
          rows={unpinnedRows}
          renderRows={benchmark.renderStaticParamList}
          grow
        />
      )}
    </section>
  );
}

function BenchmarkParamArea({
  title,
  rows,
  renderRows,
  grow = false,
}: {
  title: string;
  rows: Array<BenchmarkParamRow>;
  renderRows: boolean;
  grow?: boolean;
}) {
  const areaClassName = grow
    ? "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden"
    : "mt-2 flex flex-col";

  return (
    <section
      className={`${areaClassName} rounded-lg border border-dashed border-setta-200 bg-setta-50/50 dark:border-setta-700 dark:bg-setta-900/30`}
      data-settings-benchmark-shell={title.toLowerCase().replace(/\s+/g, "-")}
    >
      <header className="flex items-center justify-between gap-3 px-3 py-2 text-[0.6rem] uppercase tracking-[0.16em] text-setta-400 dark:text-setta-500">
        <span>{title}</span>
        <span>{rows.length} rows</span>
      </header>
      {renderRows ? (
        <div className="flex min-h-0 flex-col overflow-y-auto px-1 pb-2">
          {rows.length === 0 ? (
            <div className="px-2 py-1 text-[0.65rem] text-setta-400 dark:text-setta-500">
              Empty
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-setta-600 dark:text-setta-200"
                data-param-row="true"
                data-settings-benchmark-static-param-row="true"
                style={{ paddingLeft: `${row.depth * 12 + 8}px` }}
              >
                <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-setta-300 dark:bg-setta-600" />
                <span className="truncate">{row.label}</span>
                {row.isParent && (
                  <span className="ml-auto text-[0.5rem] uppercase tracking-[0.16em] text-setta-400 dark:text-setta-500">
                    Group
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="px-3 pb-3 text-[0.65rem] text-setta-400 dark:text-setta-500">
          Rows disabled for this benchmark stage.
        </div>
      )}
    </section>
  );
}
