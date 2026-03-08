import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import {
  SettingsAllSettingsBenchmarkStaticParamRowItems,
  useSettingsAllSettingsBenchmarkParamRows,
} from "components/Params/SettingsAllSettingsBenchmarkParamRows";
import _ from "lodash";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

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
    pinnedTopLevelParamIds,
    pinnedRequiredParamIdsToPaths,
    unpinnedTopLevelParamIds,
    unpinnedRequiredParamIdsToPaths,
    hideUnpinnedParams,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    return {
      inputPortCount: impl.edgeInputParams.length,
      outputPortCount: impl.edgeOutputPorts.length,
      pinnedTopLevelParamIds: pinned.topLevelParamIds,
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
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
        sectionId={sectionId}
        title="Pinned Params"
        paramIds={pinnedTopLevelParamIds}
        requiredParamIdsToPaths={pinnedRequiredParamIdsToPaths}
        renderRows={benchmark.renderStaticParamList}
      />
      {!hideUnpinnedParams && (
        <BenchmarkParamArea
          sectionId={sectionId}
          title="Params"
          paramIds={unpinnedTopLevelParamIds}
          requiredParamIdsToPaths={unpinnedRequiredParamIdsToPaths}
          renderRows={benchmark.renderStaticParamList}
          grow
        />
      )}
    </section>
  );
}

function BenchmarkParamArea({
  sectionId,
  title,
  paramIds,
  requiredParamIdsToPaths,
  renderRows,
  grow = false,
}: {
  sectionId: string;
  title: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  renderRows: boolean;
  grow?: boolean;
}) {
  const rows = useSettingsAllSettingsBenchmarkParamRows({
    sectionId,
    paramIds,
    requiredParamIdsToPaths,
  });
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
            <SettingsAllSettingsBenchmarkStaticParamRowItems rows={rows} />
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
