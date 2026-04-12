import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { setSpreadsheetFilePath } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
import {
  getFileBrowserDragPayload,
  type FileBrowserDragPayload,
} from "utils/fileBrowserDragPayload";
import {
  NotificationTypeEnum,
  SectionTypeEnum,
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

const INVALID_SPREADSHEET_DROP_MESSAGE =
  "Spreadsheet sections accept only CSV, TSV, XLS, or XLSX files.";

type SpreadsheetDropTarget =
  | {
      kind: "workspace";
      name: string;
      path: string;
    }
  | {
      kind: "native";
      file: File;
    };

export function resolveSpreadsheetDropTarget(
  payload: FileBrowserDragPayload | null,
  nativeFile: File | null,
): SpreadsheetDropTarget | null {
  if (payload?.type === "file") {
    return {
      kind: "workspace",
      name: payload.name,
      path: payload.fullPath,
    };
  }
  return nativeFile ? { kind: "native", file: nativeFile } : null;
}

export function isSupportedSpreadsheetDropTarget(
  target: SpreadsheetDropTarget,
): boolean {
  return target.kind === "workspace"
    ? isSpreadsheetPath(target.name) || isSpreadsheetPath(target.path)
    : isSpreadsheetPath(target.file.name);
}

function notifyInvalidSpreadsheetDrop() {
  addTemporaryNotification(
    INVALID_SPREADSHEET_DROP_MESSAGE,
    NotificationTypeEnum.warning,
  );
}

async function persistImportedSpreadsheetFile(
  file: File,
  persistPath: (nextPath: string) => void,
) {
  const importResult = await importNativeFileToWorkspace(file);
  if (importResult.status !== "ok") {
    addTemporaryNotification(importResult.error, NotificationTypeEnum.error);
    return;
  }
  persistPath(importResult.filePath);
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
          callOpenAPI(
            setSpreadsheetFilePath({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                filePath: nextPath,
                activeSheet,
                frontendOpId,
              },
            } as Parameters<typeof setSpreadsheetFilePath>[0]),
          ),
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
      const dropTarget = resolveSpreadsheetDropTarget(
        getFileBrowserDragPayload(event.dataTransfer),
        event.dataTransfer.files.item(0),
      );
      if (!dropTarget) {
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
      const dropTarget = resolveSpreadsheetDropTarget(
        getFileBrowserDragPayload(event.dataTransfer),
        event.dataTransfer.files.item(0),
      );
      setIsDropTargetActive(false);
      if (isDisabled || !dropTarget) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!isSupportedSpreadsheetDropTarget(dropTarget)) {
        notifyInvalidSpreadsheetDrop();
        return;
      }
      if (dropTarget.kind === "workspace") {
        persistPath(dropTarget.path);
        return;
      }
      void persistImportedSpreadsheetFile(dropTarget.file, persistPath);
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
