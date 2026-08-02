import type { FilebrowserFileBrowserDownloadUrlEntry } from "openapi/http";
import type { CSSProperties, MouseEventHandler } from "react";
import type { FileBrowserDragPayload } from "utils/fileBrowserDragPayload";

export const ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 28;
export const FILE_BROWSER_DATE_COLUMN_MIN_WIDTH = 96;
export const FILE_BROWSER_FILE_COLUMN_MIN_WIDTH = 120;
export const FILE_COLUMN_CSS_VAR = "--file-browser-column-width";
export const FILTER_DEBOUNCE_MS = 150;
export const MAX_ENTRIES = 5000;
export const FILTER_RECURSIVE_MIN_CHARS = 2;
export const FILTER_RECURSIVE_MAX_FOLDERS = 600;
export const FILE_URL_REFRESH_BUFFER_MS = 30000;
export const SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT = 8;

export type NodeKind = "folder" | "file";

export type FileBrowserClipboardEntry = {
  sourcePath: string;
  sourceType: NodeKind;
  operation: "copy" | "move";
};

export type SortKey = "name" | "modified";
export type SortDirection = "asc" | "desc";

export type FileUrlEntry = Pick<
  FilebrowserFileBrowserDownloadUrlEntry,
  "url" | "expiresAt"
>;

export type FileNode = {
  name: string;
  fullPath: string;
  type: NodeKind;
  parentPath: string | null;
  mtime?: number | null;
  isSettaInitialized?: boolean;
};

export type FileBrowserRootStateSnapshot = {
  rootPath: string | null;
  selectedPath: string | null;
  expandedPaths: Record<string, boolean>;
};

export type FlattenedNode = FileNode & {
  depth: number;
};

export type FlattenedFileNode = FlattenedNode;

export type FileBrowserPaneProps = {
  onFileOpen?: (node: FileNode) => void;
  onFolderOpen?: (node: FileNode) => void;
  onSelectionChange?: (node: FileNode | null) => void;
  useFileBrowserStateHook?: typeof import("state/definitions").useFileBrowserState;
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

export type FileBrowserFilterProps = {
  useFileBrowserStateHook?: typeof import("state/definitions").useFileBrowserState;
  className?: string;
  tooltipParentDivId?: string | null;
  saveSearchConfig?: {
    canSave: boolean;
    onSaveSearch: (query: string) => void;
  } | null;
};

type FileBrowserRowData = {
  items: FlattenedNode[];
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  rootPath: string | null;
  dragTargetFolderPath: string | null;
  fileUrlMap: Record<string, FileUrlEntry>;
  showSearchPathTooltips: boolean;
  loadingPaths: Record<string, boolean>;
  errorByPath: Record<string, string>;
  columnWidth: string;
  listInsetLeft: number;
  showSettaInitializedBadge: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onSetDragTargetFolder: (path: string | null) => void;
  onDropIntoFolder: (
    payload: FileBrowserDragPayload,
    destinationFolderPath: string,
  ) => void;
};

export type FileBrowserRowProps = FileBrowserRowData & {
  index: number;
  style: CSSProperties;
  gridTemplateColumns: string;
};
