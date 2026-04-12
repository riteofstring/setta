import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";
import type {
  DragEvent,
  KeyboardEventHandler,
  MouseEventHandler,
  MutableRefObject,
} from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { List } from "react-window";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { FileBrowserFilter } from "./FileBrowserFilter";
import { FileBrowserRow } from "./FileBrowserRow";
import type { FileBrowserPaneProps } from "./fileBrowserPaneShared";
import { ROW_HEIGHT } from "./fileBrowserPaneShared";

function handlePaneDragLeave(
  event: DragEvent<HTMLDivElement>,
  setDragTargetFolderPath: (path: string | null) => void,
): void {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
    setDragTargetFolderPath(null);
  }
}

function getHeaderPaddingStyle(listInsetLeft: number) {
  return listInsetLeft ? { paddingLeft: listInsetLeft } : undefined;
}

function shouldShowInitializedBadge(args: {
  includeSettaInitializedFolders: boolean;
  showSettaInitializedBadgePill: boolean;
}): boolean {
  return (
    args.includeSettaInitializedFolders && args.showSettaInitializedBadgePill
  );
}

function FileBrowserPaneMeta(args: {
  breadcrumbs: Array<{ path: string; label: string }>;
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  metaPaddingClassName?: string;
  parentPath: string | null;
  pathCompletionSource: ReturnType<
    typeof import("components/Utils/CodeMirror/folderPathCompletions").createFolderPathCompletionSource
  >;
  pathInputId: string;
  rootError: string | null;
  rootPath: string | null;
  showFilter: boolean;
  showPathNavigation: boolean;
  handleNavigateToPath: (path: string) => void;
}) {
  if (!args.showFilter && !args.showPathNavigation && !args.rootError) {
    return null;
  }
  return (
    <div className={`flex flex-col gap-2 ${args.metaPaddingClassName ?? ""}`}>
      {args.showPathNavigation ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <FileBrowserGoUpButton
              disabled={!args.parentPath}
              onClick={() => {
                if (args.parentPath) {
                  args.handleNavigateToPath(args.parentPath);
                }
              }}
            />
            <FileBrowserPathInput
              inputId={`CodeMirror-file-browser-path-${args.pathInputId}`}
              dataTestId="file-browser-path-input"
              value={args.rootPath ?? ""}
              onCommit={args.handleNavigateToPath}
              completionSource={args.pathCompletionSource}
            />
          </div>
          <FileBrowserBreadcrumbs
            breadcrumbs={args.breadcrumbs}
            currentPath={args.rootPath ?? ""}
            onSelect={args.handleNavigateToPath}
          />
        </>
      ) : null}
      {args.showFilter ? (
        <div className="flex flex-col gap-1">
          <FileBrowserFilter useFileBrowserStateHook={args.fileBrowserState} />
        </div>
      ) : null}
      {args.rootError ? (
        <p className="text-xs text-red-500">{args.rootError}</p>
      ) : null}
    </div>
  );
}

function FileBrowserPaneList(args: {
  columnWidth: string;
  dateSortDirection: "asc" | "desc";
  displayedItems: Parameters<typeof List>[0]["rowProps"]["items"];
  dragTargetFolderPath: string | null;
  errorByPath: Record<string, string>;
  expandedPaths: Record<string, boolean>;
  fileSortDirection: "asc" | "desc";
  fileUrlMap: Record<string, { url: string; expiresAt: number }>;
  gridTemplateColumns: string;
  handleKeyDown: KeyboardEventHandler<HTMLDivElement>;
  handleResizeStart: MouseEventHandler<HTMLDivElement>;
  handleRowsRendered: (args: { startIndex: number; stopIndex: number }) => void;
  handleSort: (key: "name" | "modified") => void;
  handleDropIntoFolder: (
    payload: { fullPath: string; type: "folder" | "file" },
    destinationFolderPath: string,
  ) => void;
  handleOpen: (path: string) => void;
  handleSelect: (path: string) => void;
  handleToggle: (path: string) => void;
  includeSettaInitializedFolders: boolean;
  listHeight: number;
  listInsetLeft: number;
  listRef: ReturnType<typeof import("react-window").useListRef>;
  listWidth: number;
  listWrapperRef: MutableRefObject<HTMLDivElement | null>;
  loadingPaths: Record<string, boolean>;
  rootPath: string | null;
  selectedPath: string | null;
  setDragTargetFolderPath: (path: string | null) => void;
  showSearchPathTooltips: boolean;
  showSettaInitializedBadgePill: boolean;
  sortKey: "name" | "modified";
}) {
  return (
    <div
      ref={args.listWrapperRef}
      className="nodrag relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white/80 dark:bg-setta-950/60"
      tabIndex={0}
      onKeyDown={args.handleKeyDown}
      onDragLeave={(event) =>
        handlePaneDragLeave(event, args.setDragTargetFolderPath)
      }
    >
      <div
        className="group box-border grid h-7 items-center border-b border-setta-100/80 bg-setta-50/70 px-2 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-800/80 dark:bg-setta-900/40 dark:text-setta-400"
        style={{ gridTemplateColumns: args.gridTemplateColumns }}
      >
        <div
          className="relative flex items-center border-r border-transparent pr-6 transition-colors group-hover:border-setta-100/80 dark:group-hover:border-setta-800/80"
          style={getHeaderPaddingStyle(args.listInsetLeft)}
        >
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={() => args.handleSort("name")}
            aria-label={`Sort by name (${args.fileSortDirection === "asc" ? "A to Z" : "Z to A"})`}
          >
            <span className="min-w-0 truncate">Files</span>
            {args.fileSortDirection === "asc" ? (
              <HiChevronUp
                className={
                  args.sortKey === "name"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            ) : (
              <HiChevronDown
                className={
                  args.sortKey === "name"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            )}
          </button>
          <div
            className="group/resize nopan nodrag pointer-events-none absolute -right-2 top-0 flex h-full w-4 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            onMouseDown={args.handleResizeStart}
          >
            <div className="h-4 w-1.5 rounded-full bg-setta-400/90 transition-colors group-hover/resize:bg-blue-500 dark:bg-setta-500 dark:group-hover/resize:bg-blue-400" />
          </div>
        </div>
        <div className="flex items-center justify-end pl-3">
          <button
            type="button"
            className="flex w-full min-w-0 items-center justify-end gap-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={() => args.handleSort("modified")}
            aria-label={`Sort by date modified (${args.dateSortDirection === "asc" ? "oldest to newest" : "newest to oldest"})`}
          >
            <span className="min-w-0 truncate text-right">Date modified</span>
            {args.dateSortDirection === "asc" ? (
              <HiChevronUp
                className={
                  args.sortKey === "modified"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            ) : (
              <HiChevronDown
                className={
                  args.sortKey === "modified"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            )}
          </button>
        </div>
      </div>
      <div className="h-full w-full overflow-x-hidden">
        <List
          listRef={args.listRef}
          rowComponent={FileBrowserRow}
          rowCount={args.displayedItems.length}
          rowHeight={ROW_HEIGHT}
          className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag overflow-x-hidden`}
          onRowsRendered={args.handleRowsRendered}
          rowProps={{
            items: args.displayedItems,
            expandedPaths: args.expandedPaths,
            selectedPath: args.selectedPath,
            rootPath: args.rootPath,
            dragTargetFolderPath: args.dragTargetFolderPath,
            fileUrlMap: args.fileUrlMap,
            showSearchPathTooltips: args.showSearchPathTooltips,
            loadingPaths: args.loadingPaths,
            errorByPath: args.errorByPath,
            gridTemplateColumns: args.gridTemplateColumns,
            listInsetLeft: args.listInsetLeft,
            showSettaInitializedBadge: shouldShowInitializedBadge({
              includeSettaInitializedFolders:
                args.includeSettaInitializedFolders,
              showSettaInitializedBadgePill: args.showSettaInitializedBadgePill,
            }),
            onToggle: args.handleToggle,
            onSelect: args.handleSelect,
            onOpen: args.handleOpen,
            onSetDragTargetFolder: args.setDragTargetFolderPath,
            onDropIntoFolder: args.handleDropIntoFolder,
          }}
          style={{ height: args.listHeight, width: args.listWidth }}
        />
      </div>
    </div>
  );
}

type FileBrowserPaneViewProps = Pick<
  FileBrowserPaneProps,
  | "includeSettaInitializedFolders"
  | "listInsetLeft"
  | "metaPaddingClassName"
  | "showFilter"
  | "showPathNavigation"
  | "showSettaInitializedBadgePill"
> & {
  breadcrumbs: Array<{ path: string; label: string }>;
  columnWidth: string;
  dateSortDirection: "asc" | "desc";
  displayedItems: Parameters<typeof List>[0]["rowProps"]["items"];
  dragTargetFolderPath: string | null;
  errorByPath: Record<string, string>;
  expandedPaths: Record<string, boolean>;
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  fileSortDirection: "asc" | "desc";
  fileUrlMap: Record<string, { url: string; expiresAt: number }>;
  gridTemplateColumns: string;
  handleDropIntoFolder: (
    payload: { fullPath: string; type: "folder" | "file" },
    destinationFolderPath: string,
  ) => void;
  handleKeyDown: KeyboardEventHandler<HTMLDivElement>;
  handleNavigateToPath: (path: string) => void;
  handleOpen: (path: string) => void;
  handleResizeStart: MouseEventHandler<HTMLDivElement>;
  handleRowsRendered: (args: { startIndex: number; stopIndex: number }) => void;
  handleSelect: (path: string) => void;
  handleSort: (key: "name" | "modified") => void;
  handleToggle: (path: string) => void;
  listHeight: number;
  listRef: ReturnType<typeof import("react-window").useListRef>;
  listWidth: number;
  listWrapperRef: MutableRefObject<HTMLDivElement | null>;
  loadingPaths: Record<string, boolean>;
  parentPath: string | null;
  pathCompletionSource: ReturnType<
    typeof import("components/Utils/CodeMirror/folderPathCompletions").createFolderPathCompletionSource
  >;
  pathInputId: string;
  rootError: string | null;
  rootPath: string | null;
  selectedPath: string | null;
  setDragTargetFolderPath: (path: string | null) => void;
  showSearchPathTooltips: boolean;
  sortKey: "name" | "modified";
};

export function FileBrowserPaneView(props: FileBrowserPaneViewProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <FileBrowserPaneMeta
        breadcrumbs={props.breadcrumbs}
        fileBrowserState={props.fileBrowserState}
        metaPaddingClassName={props.metaPaddingClassName}
        parentPath={props.parentPath}
        pathCompletionSource={props.pathCompletionSource}
        pathInputId={props.pathInputId}
        rootError={props.rootError}
        rootPath={props.rootPath}
        showFilter={props.showFilter}
        showPathNavigation={props.showPathNavigation}
        handleNavigateToPath={props.handleNavigateToPath}
      />
      <FileBrowserPaneList
        columnWidth={props.columnWidth}
        dateSortDirection={props.dateSortDirection}
        displayedItems={props.displayedItems}
        dragTargetFolderPath={props.dragTargetFolderPath}
        errorByPath={props.errorByPath}
        expandedPaths={props.expandedPaths}
        fileSortDirection={props.fileSortDirection}
        fileUrlMap={props.fileUrlMap}
        gridTemplateColumns={props.gridTemplateColumns}
        handleDropIntoFolder={props.handleDropIntoFolder}
        handleKeyDown={props.handleKeyDown}
        handleOpen={props.handleOpen}
        handleResizeStart={props.handleResizeStart}
        handleRowsRendered={props.handleRowsRendered}
        handleSelect={props.handleSelect}
        handleSort={props.handleSort}
        handleToggle={props.handleToggle}
        includeSettaInitializedFolders={props.includeSettaInitializedFolders}
        listHeight={props.listHeight}
        listInsetLeft={props.listInsetLeft}
        listRef={props.listRef}
        listWidth={props.listWidth}
        listWrapperRef={props.listWrapperRef}
        loadingPaths={props.loadingPaths}
        rootPath={props.rootPath}
        selectedPath={props.selectedPath}
        setDragTargetFolderPath={props.setDragTargetFolderPath}
        showSearchPathTooltips={props.showSearchPathTooltips}
        showSettaInitializedBadgePill={props.showSettaInitializedBadgePill}
        sortKey={props.sortKey}
      />
    </div>
  );
}
