import {
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import {
  downloadBinary,
  getFileBrowserFileContent,
  writeFileBrowserFileContent,
  type FilebrowserFileContentResponse,
  type FilebrowserFileStatResponse,
  type FilebrowserWriteFileContentResponse,
} from "openapi/http";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  FiColumns,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSettings,
  FiX,
} from "react-icons/fi";

import { useListRef } from "react-window";

import { uploadBinaryPayload } from "utils/binaryUpload";
import {
  binaryPayloadToUint8Array,
  type BinaryPayload,
} from "utils/binaryPayload";

import { NO_PAN_CLASS_NAME } from "utils/constants";

import {
  getSpreadsheetColumnLabel,
  parseSpreadsheetBytes,
  serializeSpreadsheetBytes,
} from "utils/spreadsheet";

import {
  SPREADSHEET_FILTER_INPUT_CLASS_NAME,
  type SpreadsheetDensityMetrics,
} from "../fileBrowserSpreadsheetGrid";

import {
  shouldClearSpreadsheetDirtyAfterSave,
  type SpreadsheetSortState,
} from "../fileBrowserSpreadsheetState";

export const SPREADSHEET_AUTO_RELOAD_INTERVAL_MS = 2000;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

type FileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FilebrowserFileContentResponse>;

export type FileBrowserFileStatRouteResponse =
  ResponseDataAndStatus<FilebrowserFileStatResponse>;

type WriteFileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FilebrowserWriteFileContentResponse>;

type BinaryDownloadRouteResponse = ResponseDataAndStatus<BinaryPayload>;

export type SpreadsheetDraft = {
  path: string;
  sheetName: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
  mtimeNs: number;
  sourceWorkbookBytes: Uint8Array | null;
};

type SpreadsheetLoadOutcome =
  | {
      status: "error";
      message: string;
    }
  | {
      status: "success";
      draft: SpreadsheetDraft;
    };

type SpreadsheetSaveOutcome =
  | {
      status: "error";
      message: string;
    }
  | {
      status: "stale";
    }
  | {
      status: "success";
      mtimeNs: number;
    };

export type SpreadsheetSelectedFile = {
  name: string;
  fullPath: string;
};

export type SpreadsheetGridMode = "dom" | "glide";

export async function loadSpreadsheetDraft(
  path: string,
): Promise<SpreadsheetLoadOutcome> {
  const response = (await callOpenAPI(
    getFileBrowserFileContent({
      body: {
        path,
        maxBytes: MAX_FILE_BYTES,
      },
    } as Parameters<typeof getFileBrowserFileContent>[0]),
  )) as FileBrowserFileContentRouteResponse;
  if (!res200(response)) {
    return {
      status: "error",
      message:
        getErrorDetail(response.data) ?? "Failed to load spreadsheet file.",
    };
  }
  const binaryResponse = (await callOpenAPI(
    downloadBinary({
      path: {
        contentId: response.data.contentId,
      },
    } as Parameters<typeof downloadBinary>[0]),
  )) as BinaryDownloadRouteResponse;
  if (!res200(binaryResponse) || !binaryResponse.data) {
    return {
      status: "error",
      message:
        getErrorDetail(binaryResponse.data) ??
        "Failed to load spreadsheet file payload.",
    };
  }
  const parsed = await parseSpreadsheetBytes(
    path,
    await binaryPayloadToUint8Array(binaryResponse.data),
  );
  return {
    status: "success",
    draft: {
      path,
      sheetName: parsed.sheetName,
      rows: parsed.rows,
      rowCount: parsed.rowCount,
      columnCount: parsed.columnCount,
      mtimeNs: response.data.mtimeNs,
      sourceWorkbookBytes: parsed.sourceWorkbookBytes,
    },
  };
}

export function resetSpreadsheetEditorView(args: {
  editVersionRef: MutableRefObject<number>;
  setColumnWidths: (value: Record<number, number>) => void;
  setErrorText: (value: string | null) => void;
  setFilterQuery: (value: string) => void;
  setGridSelection: (value: GridSelection | undefined) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSelectionSummary: (value: string) => void;
  setSortState: (value: SpreadsheetSortState | null) => void;
  setStatusText: (value: string | null) => void;
}): void {
  const {
    editVersionRef,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setSelectionSummary,
    setSortState,
    setStatusText,
  } = args;
  editVersionRef.current = 0;
  setIsDirty(false);
  setHasExternalDiskChange(false);
  setFilterQuery("");
  setSortState(null);
  setColumnWidths({});
  setGridSelection(undefined);
  setSelectionSummary("No selection");
  setStatusText(null);
  setErrorText(null);
}

export function applyLoadedSpreadsheetDraft(args: {
  draft: SpreadsheetDraft;
  editVersionRef: MutableRefObject<number>;
  listRef: ReturnType<typeof useListRef>;
  setColumnWidths: (value: Record<number, number>) => void;
  setErrorText: (value: string | null) => void;
  setFilterQuery: (value: string) => void;
  setGridSelection: (value: GridSelection | undefined) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSelectionSummary: (value: string) => void;
  setSheet: (value: SpreadsheetDraft | null) => void;
  setSortState: (value: SpreadsheetSortState | null) => void;
  setStatusText: (value: string | null) => void;
}): void {
  const {
    draft,
    editVersionRef,
    listRef,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setSelectionSummary,
    setSheet,
    setSortState,
    setStatusText,
  } = args;
  setSheet(draft);
  resetSpreadsheetEditorView({
    editVersionRef,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setSelectionSummary,
    setSortState,
    setStatusText,
  });
  listRef.current?.scrollToRow({ index: 0, align: "start" });
}

function resolveSpreadsheetSaveFileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? "spreadsheet.bin";
}

export async function persistSpreadsheetSave(args: {
  expectedMtimeNs: number;
  isSaveResultStale: () => boolean;
  sheet: SpreadsheetDraft;
}): Promise<SpreadsheetSaveOutcome> {
  const { expectedMtimeNs, isSaveResultStale, sheet } = args;
  const bytes = await serializeSpreadsheetBytes(
    sheet.path,
    sheet.sheetName,
    sheet.rows,
    sheet.sourceWorkbookBytes,
  );
  const uploadResult = await uploadBinaryPayload({
    bytes,
    fileName: resolveSpreadsheetSaveFileName(sheet.path),
    mimeType: null,
  });
  if (uploadResult.status === "failed") {
    return {
      status: "error",
      message: uploadResult.error,
    };
  }
  if (isSaveResultStale()) {
    return { status: "stale" };
  }
  const response = (await callOpenAPI(
    writeFileBrowserFileContent({
      body: {
        path: sheet.path,
        contentId: uploadResult.contentId,
        expectedMtimeNs,
      },
    } as Parameters<typeof writeFileBrowserFileContent>[0]),
  )) as WriteFileBrowserFileContentRouteResponse;
  if (isSaveResultStale()) {
    return { status: "stale" };
  }
  if (!res200(response)) {
    return {
      status: "error",
      message:
        getErrorDetail(response.data) ?? "Failed to save spreadsheet file.",
    };
  }
  return {
    status: "success",
    mtimeNs: response.data.mtimeNs,
  };
}

export function applySuccessfulSpreadsheetSave(args: {
  mtimeNs: number;
  path: string;
  saveStartEditVersion: number;
  currentEditVersion: number;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): void {
  const {
    currentEditVersion,
    mtimeNs,
    path,
    saveStartEditVersion,
    setHasExternalDiskChange,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  setSheet((prev) => {
    if (!prev || prev.path !== path) {
      return prev;
    }
    return {
      ...prev,
      mtimeNs,
    };
  });
  setStatusText("Saved.");
  if (
    shouldClearSpreadsheetDirtyAfterSave({
      saveStartEditVersion,
      currentEditVersion,
    })
  ) {
    setIsDirty(false);
  }
  setHasExternalDiskChange(false);
}

function getSpreadsheetCellAddress(
  columnIndex: number,
  rowIndex: number,
): string {
  return `${getSpreadsheetColumnLabel(Math.max(0, columnIndex))}${Math.max(1, rowIndex + 1)}`;
}

type SpreadsheetSelectionBounds = {
  endColumn: number;
  endRow: number;
  extraRanges: number;
  startColumn: number;
  startRow: number;
};

function resolveSpreadsheetSelectionBounds(
  selection: GridSelection | undefined,
): SpreadsheetSelectionBounds | null {
  const currentRange = selection?.current?.range;
  if (!currentRange) {
    return null;
  }
  const startColumn = Math.max(0, currentRange.x);
  const startRow = Math.max(0, currentRange.y);
  return {
    startColumn,
    startRow,
    endColumn: Math.max(
      startColumn,
      currentRange.x + Math.max(1, currentRange.width) - 1,
    ),
    endRow: Math.max(
      startRow,
      currentRange.y + Math.max(1, currentRange.height) - 1,
    ),
    extraRanges: selection?.current?.rangeStack?.length ?? 0,
  };
}

function formatSpreadsheetSelectionBaseSummary(
  bounds: SpreadsheetSelectionBounds,
): string {
  const startAddress = getSpreadsheetCellAddress(
    bounds.startColumn,
    bounds.startRow,
  );
  const endAddress = getSpreadsheetCellAddress(bounds.endColumn, bounds.endRow);
  return startAddress === endAddress
    ? `Selected ${startAddress}`
    : `Selected ${startAddress}:${endAddress}`;
}

export function formatSpreadsheetSelectionSummary(
  selection: GridSelection | undefined,
): string {
  const bounds = resolveSpreadsheetSelectionBounds(selection);
  if (!bounds) {
    return "No selection";
  }
  const baseSummary = formatSpreadsheetSelectionBaseSummary(bounds);
  if (bounds.extraRanges <= 0) {
    return baseSummary;
  }
  return `${baseSummary} (+${bounds.extraRanges} range${bounds.extraRanges === 1 ? "" : "s"})`;
}

export function resolveSpreadsheetHeaderSortSuffix(
  sortState: SpreadsheetSortState | null,
  columnIndex: number,
): string {
  if (!sortState || sortState.columnIndex !== columnIndex) {
    return "";
  }
  return sortState.direction === "asc" ? " ↑" : " ↓";
}

function resolveSpreadsheetSortDirectionLabel(
  sortState: SpreadsheetSortState | null,
): string {
  return sortState?.direction === "desc" ? "Desc" : "Asc";
}

export function resolveSpreadsheetRowCountSummary(args: {
  displayedRowCount: number;
  sheet: SpreadsheetDraft;
}): string {
  const { displayedRowCount, sheet } = args;
  return displayedRowCount === sheet.rowCount
    ? `${sheet.rowCount} rows · ${sheet.columnCount} columns`
    : `${displayedRowCount} shown of ${sheet.rowCount} rows · ${sheet.columnCount} columns`;
}

export function canMutateSpreadsheet(args: {
  isLoading: boolean;
  isSaving: boolean;
  readOnly: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isLoading, isSaving, readOnly, sheet } = args;
  return !!sheet && !isLoading && !isSaving && !readOnly;
}

export function canReloadSpreadsheet(args: {
  isLoading: boolean;
  isSaving: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isLoading, isSaving, sheet } = args;
  return !!sheet && !isLoading && !isSaving;
}

export function canSaveSpreadsheet(args: {
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  readOnly: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isDirty, isLoading, isSaving, readOnly, sheet } = args;
  return !!sheet && !isLoading && !isSaving && !readOnly && isDirty;
}

type SpreadsheetStatusMessage = {
  className: string;
  text: string;
};

function resolveSpreadsheetStatusMessages(
  args: SpreadsheetStatusBannerProps,
): SpreadsheetStatusMessage[] {
  const { errorText, hasExternalDiskChange, isDirty, readOnly, statusText } =
    args;
  const messages: SpreadsheetStatusMessage[] = [];
  if (readOnly) {
    messages.push({
      className: "mr-2 text-setta-500 dark:text-setta-400",
      text: "Read-only.",
    });
  }
  if (isDirty) {
    messages.push({
      className: "mr-2 text-amber-600 dark:text-amber-300",
      text: "Unsaved edits.",
    });
  }
  if (hasExternalDiskChange) {
    messages.push({
      className: "mr-2 text-amber-600 dark:text-amber-300",
      text: "File changed on disk.",
    });
  }
  if (statusText) {
    messages.push({
      className: "text-emerald-600",
      text: statusText,
    });
  }
  if (errorText) {
    messages.push({
      className: "text-red-500",
      text: errorText,
    });
  }
  return messages;
}

type SpreadsheetEmptyStateProps = {
  message: string;
};

export function SpreadsheetEmptyState({ message }: SpreadsheetEmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
      {message}
    </div>
  );
}

type SpreadsheetDesktopToolbarProps = {
  canMutate: boolean;
  canReload: boolean;
  canSave: boolean;
  filterQuery: string;
  isSaving: boolean;
  onAddColumn: () => void;
  onAddRow: () => void;
  onApplySortColumnValue: (value: string) => void;
  onClearFilterAndSort: () => void;
  onFilterQueryChange: (value: string) => void;
  onReload: () => void;
  onSave: () => void;
  onToggleSortDirection: () => void;
  selectedName: string;
  sheet: SpreadsheetDraft | null;
  sortState: SpreadsheetSortState | null;
};

export function SpreadsheetDesktopToolbar({
  canMutate,
  canReload,
  canSave,
  filterQuery,
  isSaving,
  onAddColumn,
  onAddRow,
  onApplySortColumnValue,
  onClearFilterAndSort,
  onFilterQueryChange,
  onReload,
  onSave,
  onToggleSortDirection,
  selectedName,
  sheet,
  sortState,
}: SpreadsheetDesktopToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-setta-200 px-3 py-2 @container/spreadsheet-toolbar dark:border-setta-800">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
          {selectedName}
        </p>
        {sheet ? (
          <div className="hidden min-w-0 flex-1 items-center gap-2 @[480px]/spreadsheet-toolbar:flex">
            <search
              className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 flex-1 items-center`}
            >
              <i className="gg-sort-az absolute left-1.5 text-setta-300 dark:text-setta-600" />
              <input
                className={SPREADSHEET_FILTER_INPUT_CLASS_NAME}
                data-testid="spreadsheet-filter-input"
                onChange={(event) => onFilterQueryChange(event.target.value)}
                placeholder="Filter rows"
                value={filterQuery}
              />
            </search>
            <label className="shrink-0 text-[11px] text-setta-500 dark:text-setta-400">
              Sort
              <select
                className="ml-1 rounded border border-setta-300 bg-white px-1.5 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                data-testid="spreadsheet-sort-column"
                onChange={(event) => onApplySortColumnValue(event.target.value)}
                value={sortState ? String(sortState.columnIndex) : ""}
              >
                <option value="">None</option>
                {Array.from({ length: sheet.columnCount }, (_value, index) => (
                  <option key={`sort-${index}`} value={index}>
                    {getSpreadsheetColumnLabel(index)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="shrink-0 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              data-testid="spreadsheet-sort-direction"
              disabled={!sortState}
              onClick={onToggleSortDirection}
              type="button"
            >
              {resolveSpreadsheetSortDirectionLabel(sortState)}
            </button>
            {filterQuery.length > 0 || sortState ? (
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                data-testid="spreadsheet-clear-view"
                onClick={onClearFilterAndSort}
                type="button"
              >
                <FiX size={12} />
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="hidden items-center gap-1 @[360px]/spreadsheet-toolbar:flex">
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-add-column"
          disabled={!canMutate}
          onClick={onAddColumn}
          type="button"
        >
          <FiColumns size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Column
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-add-row"
          disabled={!canMutate}
          onClick={onAddRow}
          type="button"
        >
          <FiPlus size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Row
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-reload"
          disabled={!canReload}
          onClick={onReload}
          type="button"
        >
          <FiRefreshCw size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Reload
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
          data-testid="spreadsheet-save"
          disabled={!canSave}
          onClick={onSave}
          type="button"
        >
          <FiSave size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            {isSaving ? "Saving…" : "Save"}
          </span>
        </button>
      </div>
      <SpreadsheetMobileToolbarMenu
        canMutate={canMutate}
        canReload={canReload}
        canSave={canSave}
        filterQuery={filterQuery}
        isSaving={isSaving}
        onAddColumn={onAddColumn}
        onAddRow={onAddRow}
        onApplySortColumnValue={onApplySortColumnValue}
        onClearFilterAndSort={onClearFilterAndSort}
        onFilterQueryChange={onFilterQueryChange}
        onReload={onReload}
        onSave={onSave}
        onToggleSortDirection={onToggleSortDirection}
        sheet={sheet}
        sortState={sortState}
      />
    </div>
  );
}

type SpreadsheetMobileToolbarMenuProps = Omit<
  SpreadsheetDesktopToolbarProps,
  "selectedName"
>;

function SpreadsheetMobileToolbarMenu({
  canMutate,
  canReload,
  canSave,
  filterQuery,
  isSaving,
  onAddColumn,
  onAddRow,
  onApplySortColumnValue,
  onClearFilterAndSort,
  onFilterQueryChange,
  onReload,
  onSave,
  onToggleSortDirection,
  sheet,
  sortState,
}: SpreadsheetMobileToolbarMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Spreadsheet settings"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 @[480px]/spreadsheet-toolbar:hidden dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        type="button"
      >
        <FiSettings size={12} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-30 min-w-[220px] rounded-md border border-setta-200 bg-white p-2 shadow-xl dark:border-setta-700 dark:bg-setta-900"
          sideOffset={5}
        >
          {sheet ? (
            <div className="flex flex-col gap-2">
              <search
                className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 items-center`}
              >
                <i className="gg-sort-az absolute left-1.5 text-setta-300 dark:text-setta-600" />
                <input
                  className={SPREADSHEET_FILTER_INPUT_CLASS_NAME}
                  onChange={(event) => onFilterQueryChange(event.target.value)}
                  placeholder="Filter rows"
                  value={filterQuery}
                />
              </search>
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-[11px] text-setta-500 dark:text-setta-400">
                  Sort
                </label>
                <select
                  className="min-w-0 flex-1 rounded border border-setta-300 bg-white px-1.5 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  onChange={(event) =>
                    onApplySortColumnValue(event.target.value)
                  }
                  value={sortState ? String(sortState.columnIndex) : ""}
                >
                  <option value="">None</option>
                  {Array.from(
                    { length: sheet.columnCount },
                    (_value, index) => (
                      <option key={`menu-sort-${index}`} value={index}>
                        {getSpreadsheetColumnLabel(index)}
                      </option>
                    ),
                  )}
                </select>
                <button
                  className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  disabled={!sortState}
                  onClick={onToggleSortDirection}
                  type="button"
                >
                  {resolveSpreadsheetSortDirectionLabel(sortState)}
                </button>
              </div>
              {filterQuery.length > 0 || sortState ? (
                <button
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={onClearFilterAndSort}
                  type="button"
                >
                  <FiX size={12} />
                  Clear filters
                </button>
              ) : null}
              <DropdownMenu.Separator className="my-1 h-px bg-setta-200 dark:bg-setta-700" />
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canMutate}
                onClick={onAddColumn}
                type="button"
              >
                <FiColumns size={12} />
                Add Column
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canMutate}
                onClick={onAddRow}
                type="button"
              >
                <FiPlus size={12} />
                Add Row
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canReload}
                onClick={onReload}
                type="button"
              >
                <FiRefreshCw size={12} />
                Reload
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                disabled={!canSave}
                onClick={onSave}
                type="button"
              >
                <FiSave size={12} />
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type SpreadsheetStatusBannerProps = {
  errorText: string | null;
  hasExternalDiskChange: boolean;
  isDirty: boolean;
  readOnly: boolean;
  statusText: string | null;
};

export function SpreadsheetStatusBanner({
  errorText,
  hasExternalDiskChange,
  isDirty,
  readOnly,
  statusText,
}: SpreadsheetStatusBannerProps) {
  const messages = resolveSpreadsheetStatusMessages({
    errorText,
    hasExternalDiskChange,
    isDirty,
    readOnly,
    statusText,
  });
  if (messages.length === 0) {
    return null;
  }
  return (
    <div className="border-b border-setta-200 px-3 py-1 text-[11px] dark:border-setta-800">
      {messages.map((message) => (
        <span
          key={`${message.className}:${message.text}`}
          className={message.className}
        >
          {message.text}
        </span>
      ))}
    </div>
  );
}

export type SpreadsheetGlideGridViewProps = {
  densityMetrics: SpreadsheetDensityMetrics;
  densityMultiplier: number;
  displayedRowCount: number;
  getGlideCellContent: (item: Item) =>
    | EditableGridCell
    | {
        kind: GridCellKind.Loading;
        allowOverlay: false;
      };
  glideRenderHeight: number;
  glideRenderWidth: number;
  glideTheme: Partial<Theme>;
  gridSelection: GridSelection | undefined;
  isGridEditable: boolean;
  onCellsEdited: (
    newValues: readonly {
      location: Item;
      value: EditableGridCell;
    }[],
  ) => boolean;
  onColumnResize: (columnIndex: number, newSize: number) => void;
  onDeleteSelection: (selection: GridSelection) => boolean;
  onGridSelectionChange: (selection: GridSelection) => void;
  onToggleSort: (columnIndex: number) => void;
  showRowNumbers: boolean;
  glideColumns: readonly GridColumn[];
};
