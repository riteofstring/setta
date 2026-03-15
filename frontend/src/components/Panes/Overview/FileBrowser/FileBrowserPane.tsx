import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";
import type {
  MouseEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useListRef } from "react-window";
import { addTemporaryNotification } from "state/actions/notifications";
import { openFileInCodeSection } from "state/actions/sections/createSectionFileOpenCommands";
import { useFileBrowserState } from "state/stores/fileBrowserStores";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "utils/fileBrowserPathRelation";
import { route_transfer_file_browser_entry } from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { FileBrowserPaneListSurface } from "./fileBrowserPaneListSurface";
import { FileBrowserFilter } from "./fileBrowserPaneSearchFilter";
import {
  getBaseNameFromPath,
  type FileNode,
  type NodeKind,
} from "./fileBrowserPaneTreeModel";
import { useFileBrowserPaneTreeData } from "./useFileBrowserPaneTreeData";

type FileBrowserClipboardEntry = {
  sourcePath: string;
  sourceType: NodeKind;
  operation: "copy" | "move";
};

export function isEditableFileBrowserTarget(
  target: EventTarget | null,
): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const maybeElement = target as {
    closest?: unknown;
    isContentEditable?: unknown;
  };
  if (maybeElement.isContentEditable === true) {
    return true;
  }
  if (typeof maybeElement.closest !== "function") {
    return false;
  }
  const closest = maybeElement.closest as (selector: string) => unknown;
  return (
    closest("input, textarea, select") !== null ||
    closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    closest(".cm-editor") !== null
  );
}

export function shouldSkipFileBrowserTransfer(args: {
  operation: "copy" | "move";
  sourceParentPath: string | null;
  destinationFolderPath: string;
}): boolean {
  if (args.operation !== "move" || !args.sourceParentPath) {
    return false;
  }
  const normalizedSourceParent = normalizeFileBrowserPathForComparison(
    args.sourceParentPath,
  );
  const normalizedDestination = normalizeFileBrowserPathForComparison(
    args.destinationFolderPath,
  );
  if (!normalizedSourceParent || !normalizedDestination) {
    return false;
  }
  return normalizedSourceParent === normalizedDestination;
}

export function shouldRefreshRootAfterFileBrowserTransfer(args: {
  rootPath: string | null;
  sourceParentPath: string | null;
  destinationFolderPath: string;
}): boolean {
  if (!args.rootPath) {
    return false;
  }
  const normalizedRootPath = normalizeFileBrowserPathForComparison(
    args.rootPath,
  );
  const normalizedSourceParent = args.sourceParentPath
    ? normalizeFileBrowserPathForComparison(args.sourceParentPath)
    : null;
  const normalizedDestination = normalizeFileBrowserPathForComparison(
    args.destinationFolderPath,
  );
  if (!normalizedRootPath || !normalizedDestination) {
    return false;
  }
  return (
    normalizedSourceParent === normalizedRootPath ||
    normalizedDestination === normalizedRootPath
  );
}

export function shouldRefreshMovedExpandedFolder(args: {
  operation: "copy" | "move";
  sourceType: NodeKind;
  sourcePath: string;
  destinationPath: string | null;
  expandedPaths: Record<string, boolean>;
}): boolean {
  if (args.operation !== "move" || args.sourceType !== "folder") {
    return false;
  }
  if (!args.destinationPath) {
    return false;
  }
  const normalizedSourcePath = normalizeFileBrowserPathForComparison(
    args.sourcePath,
  );
  const normalizedDestinationPath = normalizeFileBrowserPathForComparison(
    args.destinationPath,
  );
  if (!normalizedSourcePath || !normalizedDestinationPath) {
    return false;
  }
  if (normalizedSourcePath === normalizedDestinationPath) {
    return false;
  }
  return Object.entries(args.expandedPaths).some(
    ([path, isExpanded]) =>
      isExpanded === true &&
      normalizeFileBrowserPathForComparison(path) === normalizedSourcePath,
  );
}

type FileBrowserPaneProps = {
  onFileOpen?: (node: FileNode) => void;
  onFolderOpen?: (node: FileNode) => void;
  onSelectionChange?: (node: FileNode | null) => void;
  useFileBrowserStateHook?: typeof useFileBrowserState;
  showFilter?: boolean;
  showPathNavigation?: boolean;
  includeSettaInitializedFolders?: boolean;
  showSettaInitializedBadgePill?: boolean;
  allowOutsideWorkspaceRoot?: boolean;
  metaPaddingClassName?: string;
  listInsetLeft?: number;
  columnWidthConfig?: {
    columnWidth: string;
    onResizeStart: MouseEventHandler<HTMLDivElement>;
  };
};

export function FileBrowserPane({
  onFileOpen,
  onFolderOpen,
  onSelectionChange,
  useFileBrowserStateHook,
  showFilter = true,
  showPathNavigation = true,
  includeSettaInitializedFolders = false,
  showSettaInitializedBadgePill = true,
  allowOutsideWorkspaceRoot = false,
  metaPaddingClassName,
  listInsetLeft = 0,
  columnWidthConfig,
}: FileBrowserPaneProps = {}) {
  const fileBrowserState = useFileBrowserStateHook ?? useFileBrowserState;
  const {
    breadcrumbs,
    childrenByPath,
    displayedItems,
    errorByPath,
    expandedPaths,
    fetchFolderContents,
    fileUrlMap,
    filterText,
    handleNavigateToPath,
    handleNavigateUp,
    handleSelect,
    handleSort,
    handleToggle,
    loadingPaths,
    nodesByPath,
    parentPath,
    pathCompletionSource,
    requestFileUrls,
    rootError,
    rootPath,
    selectedIndex,
    selectedPath,
    sortDirection,
    sortKey,
  } = useFileBrowserPaneTreeData({
    allowOutsideWorkspaceRoot,
    fileBrowserState,
    includeSettaInitializedFolders,
    onSelectionChange,
    showPathNavigation,
  });
  const [isTooltipKeyHeld, setIsTooltipKeyHeld] = useState(false);
  const clipboardEntryRef = useRef<FileBrowserClipboardEntry | null>(null);
  const listRef = useListRef();
  const pathInputId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "KeyQ") {
        setIsTooltipKeyHeld(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "KeyQ") {
        setIsTooltipKeyHeld(false);
      }
    }

    function handleWindowBlur() {
      setIsTooltipKeyHeld(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  const handleOpen = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      if (node.type === "folder") {
        if (onFolderOpen) {
          onFolderOpen(node);
          return;
        }
        handleToggle(path);
        return;
      }
      if (onFileOpen) {
        onFileOpen(node);
        return;
      }
      const codeLanguage = resolveCodeLanguageFromPath(path);
      const fileName = getBaseNameFromPath(path);
      void openFileInCodeSection({
        filePath: path,
        fileName,
        codeLanguage,
      });
    },
    [handleToggle, nodesByPath, onFileOpen, onFolderOpen],
  );

  const transferEntryToFolder = useCallback(
    async ({
      sourcePath,
      sourceType,
      destinationFolderPath,
      operation,
    }: {
      sourcePath: string;
      sourceType: NodeKind;
      destinationFolderPath: string;
      operation: "copy" | "move";
    }): Promise<string | null> => {
      const normalizedSourcePath =
        normalizeFileBrowserPathForComparison(sourcePath);
      const normalizedDestinationFolderPath =
        normalizeFileBrowserPathForComparison(destinationFolderPath);
      if (!normalizedSourcePath || !normalizedDestinationFolderPath) {
        return null;
      }
      const sourceNode = nodesByPath[normalizedSourcePath];
      const sourceParentPath = sourceNode?.parentPath;
      if (
        shouldSkipFileBrowserTransfer({
          operation,
          sourceParentPath: sourceParentPath ?? null,
          destinationFolderPath,
        })
      ) {
        return null;
      }
      if (
        sourceType === "folder" &&
        isSameOrDescendantBrowserPath(
          normalizedDestinationFolderPath,
          normalizedSourcePath,
        )
      ) {
        addTemporaryNotification(
          "Cannot move or copy a folder into itself.",
          SettaNotificationTypeEnum.warning,
        );
        return null;
      }
      const response = await route_transfer_file_browser_entry({
        sourcePath: normalizedSourcePath,
        destinationFolderPath: normalizedDestinationFolderPath,
        operation,
      });
      if (!res200(response)) {
        const detail = getErrorDetail(response.data);
        addTemporaryNotification(
          detail ??
            `Failed to ${operation === "move" ? "move" : "copy"} file browser entry.`,
          SettaNotificationTypeEnum.error,
        );
        return null;
      }
      const destinationPath = response.data.destinationPath;
      const normalizedDestinationPath =
        normalizeFileBrowserPathForComparison(destinationPath);
      if (
        operation === "move" &&
        normalizedDestinationPath === normalizedSourcePath
      ) {
        return null;
      }
      const foldersToRefresh = new Set<string>();
      const shouldRefreshMovedFolderContents = shouldRefreshMovedExpandedFolder(
        {
          operation,
          sourceType,
          sourcePath: normalizedSourcePath,
          destinationPath: normalizedDestinationPath,
          expandedPaths: fileBrowserState.getState().expandedPaths,
        },
      );
      if (sourceParentPath) {
        foldersToRefresh.add(sourceParentPath);
      }
      foldersToRefresh.add(normalizedDestinationFolderPath);
      if (shouldRefreshMovedFolderContents && normalizedDestinationPath) {
        foldersToRefresh.add(normalizedDestinationPath);
      }
      if (
        shouldRefreshRootAfterFileBrowserTransfer({
          rootPath,
          sourceParentPath: sourceParentPath ?? null,
          destinationFolderPath: normalizedDestinationFolderPath,
        }) &&
        rootPath
      ) {
        foldersToRefresh.add(rootPath);
      }
      await Promise.all(
        Array.from(foldersToRefresh).map(async (folderPath) => {
          await fetchFolderContents(folderPath);
        }),
      );
      fileBrowserState.setState((state) => {
        if (operation !== "move") {
          return { selectedPath: destinationPath };
        }
        const nextExpandedPaths = { ...state.expandedPaths };
        const normalizedPrefix = `${normalizedSourcePath}/`;
        const wasExpanded = shouldRefreshMovedExpandedFolder({
          operation,
          sourceType,
          sourcePath: normalizedSourcePath,
          destinationPath,
          expandedPaths: state.expandedPaths,
        });
        for (const key of Object.keys(nextExpandedPaths)) {
          const normalizedKey = normalizeFileBrowserPathForComparison(key);
          if (
            normalizedKey === normalizedSourcePath ||
            normalizedKey.startsWith(normalizedPrefix)
          ) {
            delete nextExpandedPaths[key];
          }
        }
        if (wasExpanded) {
          nextExpandedPaths[destinationPath] = true;
        }
        return {
          selectedPath: destinationPath,
          expandedPaths: nextExpandedPaths,
        };
      });
      return destinationPath;
    },
    [fetchFolderContents, fileBrowserState, nodesByPath, rootPath],
  );

  const handleDropIntoFolder = useCallback(
    (
      payload: {
        fullPath: string;
        type: NodeKind;
      },
      destinationFolderPath: string,
    ) => {
      void transferEntryToFolder({
        sourcePath: payload.fullPath,
        sourceType: payload.type,
        destinationFolderPath,
        operation: "move",
      });
    },
    [transferEntryToFolder],
  );

  const handlePasteClipboard = useCallback(() => {
    const activeClipboardEntry = clipboardEntryRef.current;
    if (!activeClipboardEntry) {
      return;
    }
    const selectedNode = selectedPath ? nodesByPath[selectedPath] : null;
    const destinationFolderPath =
      selectedNode?.type === "folder"
        ? selectedNode.fullPath
        : selectedNode?.parentPath ?? rootPath;
    if (!destinationFolderPath) {
      return;
    }
    void transferEntryToFolder({
      sourcePath: activeClipboardEntry.sourcePath,
      sourceType: activeClipboardEntry.sourceType,
      destinationFolderPath,
      operation: activeClipboardEntry.operation,
    }).then((destinationPath) => {
      if (!destinationPath) {
        return;
      }
      if (activeClipboardEntry.operation === "move") {
        clipboardEntryRef.current = null;
      }
    });
  }, [nodesByPath, rootPath, selectedPath, transferEntryToFolder]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (displayedItems.length === 0) {
        return;
      }
      const hasModifier = event.metaKey || event.ctrlKey;
      const lowerKey = event.key.toLowerCase();
      if (
        hasModifier &&
        (lowerKey === "c" || lowerKey === "x" || lowerKey === "v")
      ) {
        if (isEditableFileBrowserTarget(event.target)) {
          return;
        }
      }
      if (hasModifier && (lowerKey === "c" || lowerKey === "x")) {
        if (selectedIndex < 0) {
          return;
        }
        const selectedItem = displayedItems[selectedIndex];
        if (!selectedItem || selectedItem.fullPath === rootPath) {
          return;
        }
        event.preventDefault();
        const nextClipboardEntry = {
          sourcePath: selectedItem.fullPath,
          sourceType: selectedItem.type,
          operation: lowerKey === "x" ? "move" : "copy",
        } as const;
        clipboardEntryRef.current = nextClipboardEntry;
        return;
      }
      if (hasModifier && lowerKey === "v") {
        event.preventDefault();
        handlePasteClipboard();
        return;
      }
      if (selectedIndex < 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          const nextIndex = 0;
          const nextItem = displayedItems[nextIndex];
          if (nextItem) {
            handleSelect(nextItem.fullPath);
            listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
          }
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          const nextIndex = displayedItems.length - 1;
          const nextItem = displayedItems[nextIndex];
          if (nextItem) {
            handleSelect(nextItem.fullPath);
            listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
          }
        }
        return;
      }
      const currentItem = displayedItems[selectedIndex];
      if (!currentItem) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(
          selectedIndex + 1,
          displayedItems.length - 1,
        );
        const nextItem = displayedItems[nextIndex];
        if (nextItem) {
          handleSelect(nextItem.fullPath);
          listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(selectedIndex - 1, 0);
        const nextItem = displayedItems[nextIndex];
        if (nextItem) {
          handleSelect(nextItem.fullPath);
          listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (currentItem.type === "folder") {
          const isExpanded = expandedPaths[currentItem.fullPath] === true;
          if (!isExpanded) {
            handleToggle(currentItem.fullPath);
            return;
          }
          const children = childrenByPath[currentItem.fullPath] ?? [];
          if (children.length > 0) {
            const firstChild = children[0];
            handleSelect(firstChild);
          }
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentItem.type === "folder") {
          const isExpanded = expandedPaths[currentItem.fullPath] === true;
          if (isExpanded) {
            handleToggle(currentItem.fullPath);
            return;
          }
        }
        if (currentItem.parentPath) {
          handleSelect(currentItem.parentPath);
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        handleOpen(currentItem.fullPath);
      }
    },
    [
      childrenByPath,
      displayedItems,
      expandedPaths,
      handlePasteClipboard,
      handleOpen,
      handleSelect,
      handleToggle,
      rootPath,
      selectedIndex,
    ],
  );

  const showMeta = showFilter || showPathNavigation || rootError;
  const showSearchPathTooltips =
    filterText.trim().length > 0 && isTooltipKeyHeld;

  // Owns tree state and file-browser commands; filter and list rendering live next door.
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {showMeta && (
        <div className={`flex flex-col gap-2 ${metaPaddingClassName ?? ""}`}>
          {showPathNavigation && (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <FileBrowserGoUpButton
                  disabled={!parentPath}
                  onClick={handleNavigateUp}
                />
                <FileBrowserPathInput
                  inputId={`CodeMirror-file-browser-path-${pathInputId}`}
                  dataTestId="file-browser-path-input"
                  value={rootPath ?? ""}
                  onCommit={handleNavigateToPath}
                  completionSource={pathCompletionSource}
                />
              </div>
              <FileBrowserBreadcrumbs
                breadcrumbs={breadcrumbs}
                currentPath={rootPath ?? ""}
                onSelect={handleNavigateToPath}
              />
            </>
          )}
          {showFilter && (
            <div className="flex flex-col gap-1">
              <FileBrowserFilter useFileBrowserStateHook={fileBrowserState} />
            </div>
          )}
          {rootError && <p className="text-xs text-red-500">{rootError}</p>}
        </div>
      )}
      <FileBrowserPaneListSurface
        displayedItems={displayedItems}
        expandedPaths={expandedPaths}
        selectedPath={selectedPath}
        rootPath={rootPath}
        fileUrlMap={fileUrlMap}
        showSearchPathTooltips={showSearchPathTooltips}
        loadingPaths={loadingPaths}
        errorByPath={errorByPath}
        listInsetLeft={listInsetLeft}
        showSettaInitializedBadge={
          includeSettaInitializedFolders && showSettaInitializedBadgePill
        }
        sortKey={sortKey}
        sortDirection={sortDirection}
        listRef={listRef}
        requestFileUrls={requestFileUrls}
        onKeyDown={handleKeyDown}
        onToggle={handleToggle}
        onSelect={handleSelect}
        onOpen={handleOpen}
        onDropIntoFolder={handleDropIntoFolder}
        onSort={handleSort}
        columnWidthConfig={columnWidthConfig}
      />
    </div>
  );
}
