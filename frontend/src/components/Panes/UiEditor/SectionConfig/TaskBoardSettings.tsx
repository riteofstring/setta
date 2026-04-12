import _ from "lodash";
import { setTaskBoardSectionState } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useMemo } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SectionTypeEnum,
  TaskBoardUIConfig,
  TaskBoardViewMode,
} from "utils/generatedTypes";
import { normalizeTaskBoardState } from "utils/taskBoard";
const VIEW_MODE_OPTIONS = TaskBoardUIConfig.viewModeOptions;
export function TaskBoardSettings({ sectionId }: { sectionId: string }) {
  const { canEditLayout } = useShareCapabilities();
  const { viewMode, columns, tasks, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.TaskBoard,
    );
    return {
      viewMode: impl.viewMode,
      columns: impl.columns,
      tasks: impl.tasks,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const isDisabled = isFrozen || !canEditLayout;
  const normalized = useMemo(
    () => normalizeTaskBoardState({ viewMode, columns, tasks }),
    [viewMode, columns, tasks],
  );
  function persist(nextViewMode: TaskBoardViewMode) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TaskBoardSection">(state, sectionId, {
          viewMode: nextViewMode,
          columns: normalized.columns,
          tasks: normalized.tasks,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setTaskBoardSectionState({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              viewMode: nextViewMode,
              columns: normalized.columns,
              tasks: normalized.tasks,
              frontendOpId,
            },
          } as Parameters<typeof setTaskBoardSectionState>[0]),
        ),
    });
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 p-2 dark:border-setta-700/70">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Task Board
      </p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Switch between list and kanban rendering for this section.
      </p>
      <label className="text-xs text-setta-600 dark:text-setta-300">
        View mode
        <select
          value={viewMode}
          onChange={(event) => persist(event.target.value as TaskBoardViewMode)}
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        >
          {VIEW_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        {normalized.tasks.length} tasks across {normalized.columns.length}{" "}
        columns.
      </p>
    </div>
  );
}
