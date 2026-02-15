import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import type { DragEvent } from "react";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { route_set_spreadsheet_file_path } from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  SettaNotificationTypeEnum,
  SpreadsheetGridDensityEnum,
} from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import { isSpreadsheetPath } from "utils/spreadsheet";

const LazyFileBrowserSpreadsheetEditor = lazy(async () => {
  const module = await import(
    "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor"
  );
  return { default: module.FileBrowserSpreadsheetEditor };
});

function getFileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export function SpreadsheetArea({ sectionId }: { sectionId: string }) {
  const flowZoom = useReactFlow((state) => state.transform[2]);
  const { canEditLayout } = useShareCapabilities();
  const {
    filePath,
    activeSheet,
    readOnly,
    showRowNumbers,
    density,
    autoReloadOnExternalChange,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Spreadsheet,
    );
    return {
      filePath: impl.filePath,
      activeSheet: impl.activeSheet,
      readOnly: impl.readOnly,
      showRowNumbers: impl.showRowNumbers,
      density: impl.density,
      autoReloadOnExternalChange: impl.autoReloadOnExternalChange,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const isDisabled = isFrozen || !canEditLayout;
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  const persistPath = useCallback(
    (nextPath: string) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"SpreadsheetSection">(
            state,
            sectionId,
            {
              filePath: nextPath,
              activeSheet,
            },
          );
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
    },
    [activeSheet, sectionId],
  );

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

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (isDisabled) {
        return;
      }
      const payload = getFileBrowserDragPayload(event.dataTransfer);
      const hasNativeFiles = event.dataTransfer.files.length > 0;
      if ((!payload || payload.type !== "file") && !hasNativeFiles) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setIsDropTargetActive(true);
    },
    [isDisabled],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const payload = getFileBrowserDragPayload(event.dataTransfer);
      const nativeFile = event.dataTransfer.files.item(0);
      setIsDropTargetActive(false);
      if (isDisabled) {
        return;
      }
      if ((!payload || payload.type !== "file") && !nativeFile) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (payload && payload.type === "file") {
        if (
          !isSpreadsheetPath(payload.name) &&
          !isSpreadsheetPath(payload.fullPath)
        ) {
          addTemporaryNotification(
            "Spreadsheet sections accept only CSV, TSV, XLS, or XLSX files.",
            SettaNotificationTypeEnum.warning,
          );
          return;
        }
        persistPath(payload.fullPath);
        return;
      }
      if (!nativeFile) {
        return;
      }
      if (!isSpreadsheetPath(nativeFile.name)) {
        addTemporaryNotification(
          "Spreadsheet sections accept only CSV, TSV, XLS, or XLSX files.",
          SettaNotificationTypeEnum.warning,
        );
        return;
      }
      const loadNativeFile = async () => {
        const importResult = await importNativeFileToWorkspace(nativeFile);
        if (importResult.status !== "ok") {
          addTemporaryNotification(
            importResult.error,
            SettaNotificationTypeEnum.error,
          );
          return;
        }
        persistPath(importResult.filePath);
      };
      void loadNativeFile();
    },
    [isDisabled, persistPath],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDropTargetActive(false);
    }
  }, []);

  return (
    <div
      className={`section-main section-main-full-w mx-1 mb-2 mt-1 flex min-h-[240px] min-w-[360px] flex-col gap-2 rounded-md transition-colors ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag ${
        isDropTargetActive
          ? "border border-blue-400/70 bg-blue-50/30 dark:border-blue-500/60 dark:bg-blue-950/20"
          : ""
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center rounded-md border border-setta-200 bg-white/70 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
              Loading spreadsheet...
            </div>
          }
        >
          <LazyFileBrowserSpreadsheetEditor
            selectedFile={selectedFile}
            gridMode="glide"
            flowZoom={flowZoom}
            readOnly={readOnly}
            showRowNumbers={showRowNumbers}
            density={
              density === SpreadsheetGridDensityEnum.comfortable
                ? "comfortable"
                : "compact"
            }
            autoReloadOnExternalChange={autoReloadOnExternalChange}
          />
        </Suspense>
      </div>
    </div>
  );
}
