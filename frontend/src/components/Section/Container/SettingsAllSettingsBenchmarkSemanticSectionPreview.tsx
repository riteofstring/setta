import {
  type SettingsAllSettingsBenchmarkParamRow,
  useSettingsAllSettingsBenchmarkParamRows,
} from "components/Params/SettingsAllSettingsBenchmarkParamRows";
import _ from "lodash";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

export function SettingsAllSettingsBenchmarkSemanticSectionPreview({
  sectionId,
}: {
  sectionId: string;
}) {
  const {
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
      pinnedTopLevelParamIds: pinned.topLevelParamIds,
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
      hideUnpinnedParams: impl.hideUnpinnedParams,
    };
  }, _.isEqual);

  const pinnedRows = useSettingsAllSettingsBenchmarkParamRows({
    sectionId,
    paramIds: pinnedTopLevelParamIds,
    requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
  });
  const unpinnedRows = useSettingsAllSettingsBenchmarkParamRows({
    sectionId,
    paramIds: unpinnedTopLevelParamIds,
    requiredParamIdsToPaths: unpinnedRequiredParamIdsToPaths,
  });

  return (
    <section
      aria-hidden="true"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-setta-200/90 bg-white/95 shadow-sm dark:border-setta-700/90 dark:bg-setta-950/95"
      data-settings-benchmark-section-semantic-preview-root={sectionId}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-setta-200/80 px-3 py-2 text-[0.58rem] uppercase tracking-[0.18em] text-setta-500 dark:border-setta-700/80 dark:text-setta-400">
        <span>Preview</span>
        <span>{pinnedRows.length + unpinnedRows.length} rows</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">
        <div className="flex h-full min-h-0 flex-col gap-2">
          <SemanticPreviewGroup title="Pinned" rows={pinnedRows} />
          {!hideUnpinnedParams && (
            <SemanticPreviewGroup title="Params" rows={unpinnedRows} grow />
          )}
        </div>
      </div>
    </section>
  );
}

function SemanticPreviewGroup({
  title,
  rows,
  grow = false,
}: {
  title: string;
  rows: Array<SettingsAllSettingsBenchmarkParamRow>;
  grow?: boolean;
}) {
  return (
    <section
      className={`${grow ? "min-h-0 flex-1" : ""} flex flex-col overflow-hidden rounded-md border border-setta-150/80 bg-setta-50/75 dark:border-setta-800 dark:bg-setta-900/60`}
      data-settings-benchmark-section-semantic-preview-group={title.toLowerCase()}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-[0.55rem] uppercase tracking-[0.16em] text-setta-400 dark:text-setta-500">
        <span>{title}</span>
        <span>{rows.length}</span>
      </header>
      <div className={`${grow ? "min-h-0 flex-1" : ""} overflow-hidden px-1 pb-2`}>
        <div className={`${grow ? "h-full" : ""} overflow-y-auto`}>
          {rows.length === 0 ? (
            <div className="px-2 py-1 text-[0.65rem] text-setta-400 dark:text-setta-500">
              Empty
            </div>
          ) : (
            rows.map((row) => (
              <SemanticPreviewRow key={row.id} row={row} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SemanticPreviewRow({
  row,
}: {
  row: SettingsAllSettingsBenchmarkParamRow;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-2 py-1 text-[0.65rem] text-setta-700 dark:text-setta-200"
      data-settings-benchmark-section-semantic-preview-row="true"
      data-settings-benchmark-section-semantic-preview-tone={row.previewTone}
      style={{ paddingLeft: `${row.depth * 12 + 8}px` }}
    >
      <span
        className={`inline-flex h-2 w-2 shrink-0 rounded-full ${resolveSemanticPreviewDotClassName(
          row.previewTone,
        )}`}
      />
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.48rem] uppercase tracking-[0.16em] ${resolveSemanticPreviewChipClassName(
          row.previewTone,
        )}`}
      >
        {row.previewKind}
      </span>
    </div>
  );
}

function resolveSemanticPreviewDotClassName(
  tone: SettingsAllSettingsBenchmarkParamRow["previewTone"],
) {
  switch (tone) {
    case "group":
      return "bg-setta-400 dark:bg-setta-500";
    case "code":
      return "bg-amber-400 dark:bg-amber-500";
    case "text":
      return "bg-sky-400 dark:bg-sky-500";
    case "toggle":
      return "bg-emerald-400 dark:bg-emerald-500";
    case "choice":
      return "bg-violet-400 dark:bg-violet-500";
    case "value":
      return "bg-slate-400 dark:bg-slate-500";
  }
}

function resolveSemanticPreviewChipClassName(
  tone: SettingsAllSettingsBenchmarkParamRow["previewTone"],
) {
  switch (tone) {
    case "group":
      return "bg-setta-200/90 text-setta-700 dark:bg-setta-800 dark:text-setta-200";
    case "code":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300";
    case "text":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300";
    case "toggle":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300";
    case "choice":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300";
    case "value":
      return "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300";
  }
}
