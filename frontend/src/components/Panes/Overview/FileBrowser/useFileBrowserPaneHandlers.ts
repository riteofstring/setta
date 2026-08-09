import type {
  MutableRefObject,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useCallback } from "react";
import { openFileInCodeSection } from "state/actions/sections/createSections";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { handleFileBrowserKeyDown } from "./fileBrowserKeyboard";
import { getBaseNameFromPath } from "./fileBrowserPaneCore";
import type {
  FileBrowserClipboardEntry,
  FileNode,
  FlattenedNode,
} from "./fileBrowserPaneShared";
import { collectVisibleImagePreviewPaths } from "./useFileBrowserPreviewUrls";

type UseFileBrowserPaneHandlersArgs = {
  childrenByPath: Record<string, string[]>;
  clipboardEntryRef: MutableRefObject<FileBrowserClipboardEntry | null>;
  expandedPaths: Record<string, boolean>;
  fetchFolderContents: (
    folderPath: string,
    ignoreOverride?: string[],
    rootRequestId?: number,
  ) => Promise<FileNode[] | null>;
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  handlePasteClipboard: () => void;
  listRef: ReturnType<typeof import("react-window").useListRef>;
  nodesByPath: Record<string, FileNode>;
  onFileOpen?: (node: FileNode) => void;
  onFolderOpen?: (node: FileNode) => void;
  onSelectionChange?: (node: FileNode | null) => void;
  requestFileUrls: (paths: string[]) => Promise<void>;
  rootPath: string | null;
  selectedIndex: number;
  displayedItems: FlattenedNode[];
  applyRootPath: (nextRoot: string) => void;
};

export function useFileBrowserPaneHandlers({
  childrenByPath,
  clipboardEntryRef,
  expandedPaths,
  fetchFolderContents,
  fileBrowserState,
  handlePasteClipboard,
  listRef,
  nodesByPath,
  onFileOpen,
  onFolderOpen,
  onSelectionChange,
  requestFileUrls,
  rootPath,
  selectedIndex,
  displayedItems,
  applyRootPath,
}: UseFileBrowserPaneHandlersArgs) {
  const handleToggle = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node || node.type !== "folder") {
        return;
      }
      const isExpanded = expandedPaths[path] === true;
      fileBrowserState.setState((state) => {
        const next = { ...state.expandedPaths };
        if (isExpanded) {
          delete next[path];
        } else {
          next[path] = true;
        }
        return { expandedPaths: next };
      });
      if (!isExpanded && childrenByPath[path] === undefined) {
        void fetchFolderContents(path);
      }
    },
    [
      childrenByPath,
      expandedPaths,
      fetchFolderContents,
      fileBrowserState,
      nodesByPath,
    ],
  );

  const handleSelect = useCallback(
    (path: string) => {
      fileBrowserState.setState({ selectedPath: path });
      if (onSelectionChange) {
        onSelectionChange(nodesByPath[path] ?? null);
      }
    },
    [fileBrowserState, nodesByPath, onSelectionChange],
  );

  const handleOpen = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      if (node.type === "folder") {
        if (onFolderOpen) {
          onFolderOpen(node);
        } else {
          handleToggle(path);
        }
        return;
      }
      if (onFileOpen) {
        onFileOpen(node);
        return;
      }
      void openFileInCodeSection({
        filePath: path,
        fileName: getBaseNameFromPath(path),
        codeLanguage: resolveCodeLanguageFromPath(path),
      });
    },
    [handleToggle, nodesByPath, onFileOpen, onFolderOpen],
  );

  const handleNavigateToPath = useCallback(
    (nextPath: string) => {
      const trimmed = nextPath.trim();
      if (!trimmed || trimmed === rootPath) {
        return;
      }
      applyRootPath(trimmed);
    },
    [applyRootPath, rootPath],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      handleFileBrowserKeyDown({
        event,
        displayedItems,
        selectedIndex,
        rootPath,
        expandedPaths,
        childrenByPath,
        clipboardEntryRef,
        handlePasteClipboard,
        onToggle: handleToggle,
        onSelect: handleSelect,
        onOpen: handleOpen,
        listRef,
      });
    },
    [
      childrenByPath,
      clipboardEntryRef,
      displayedItems,
      expandedPaths,
      handleOpen,
      handlePasteClipboard,
      handleSelect,
      handleToggle,
      listRef,
      rootPath,
      selectedIndex,
    ],
  );

  const handleRowsRendered = useCallback(
    ({ startIndex, stopIndex }: { startIndex: number; stopIndex: number }) => {
      void requestFileUrls(
        collectVisibleImagePreviewPaths({
          displayedItems,
          startIndex,
          stopIndex,
        }),
      );
    },
    [displayedItems, requestFileUrls],
  );

  return {
    handleToggle,
    handleSelect,
    handleOpen,
    handleNavigateToPath,
    handleKeyDown,
    handleRowsRendered,
  };
}
