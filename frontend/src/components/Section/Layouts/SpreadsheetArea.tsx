import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { FileBrowserSpreadsheetEditor } from "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor";
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

function getFileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export function SpreadsheetArea({ sectionId }: { sectionId: string }) {
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

  function persistPath(nextPath: string) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"SpreadsheetSection">(state, sectionId, {
          filePath: nextPath,
          activeSheet,
        });
      },
      send: (frontendOpId) =>
        route_set_spreadsheet_file_path({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          filePath: nextPath,
          activeSheet,
          frontendOpId,
        }),
    });
  }

  const selectedFile = useMemo(() => {
    const trimmed = filePath.trim();
    if (!trimmed) {
      return null;
    }
    return {
      fullPath: trimmed,
      name: getFileNameFromPath(trimmed),
    };
  }, [filePath]);

  return (
    <div className="section-main section-main-full-w mx-1 mb-2 mt-1 flex min-w-[360px] min-h-[240px] flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-setta-200/70 bg-white/70 px-2 py-2 dark:border-setta-800/70 dark:bg-setta-950/40">
        <input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              persistPath(pathDraft.trim());
            }
          }}
          placeholder="/absolute/path/to/file.csv"
          disabled={isDisabled}
          className="min-w-0 flex-1 rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
        <button
          type="button"
          onClick={() => persistPath(pathDraft.trim())}
          disabled={isDisabled}
          className="rounded-md border border-setta-300 px-2 py-1 text-xs text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        >
          Load
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <FileBrowserSpreadsheetEditor selectedFile={selectedFile} />
      </div>
    </div>
  );
}
