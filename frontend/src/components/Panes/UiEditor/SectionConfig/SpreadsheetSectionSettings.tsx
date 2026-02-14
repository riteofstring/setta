import _ from "lodash";
import { useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_spreadsheet_file_path } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

export function SpreadsheetSectionSettings({ sectionId }: { sectionId: string }) {
  const { canEditLayout } = useShareCapabilities();
  const { filePath, activeSheet, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Spreadsheet,
    );
    return {
      filePath: impl.filePath,
      activeSheet: impl.activeSheet,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const isDisabled = isFrozen || !canEditLayout;
  const [pathDraft, setPathDraft] = useState(filePath);

  useEffect(() => {
    setPathDraft(filePath);
  }, [filePath]);

  function persist(nextFilePath: string) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"SpreadsheetSection">(state, sectionId, {
          filePath: nextFilePath,
          activeSheet,
        });
      },
      send: (frontendOpId) =>
        route_set_spreadsheet_file_path({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          filePath: nextFilePath,
          activeSheet,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 p-2 dark:border-setta-700/70">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Spreadsheet
      </p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Set a CSV/XLSX file path to preview and edit in this section.
      </p>
      <label className="text-xs text-setta-600 dark:text-setta-300">
        File path
        <input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onBlur={() => {
            const trimmed = pathDraft.trim();
            if (trimmed !== filePath) {
              persist(trimmed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const trimmed = pathDraft.trim();
              if (trimmed !== filePath) {
                persist(trimmed);
              }
            }
          }}
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
          placeholder="/absolute/path/to/file.csv"
        />
      </label>
    </div>
  );
}
