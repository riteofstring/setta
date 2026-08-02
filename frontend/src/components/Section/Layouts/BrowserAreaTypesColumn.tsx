import { ResizeHandle } from "components/Params/ResizeHandle";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useCallback, useMemo, type ReactNode } from "react";
import { BiSolidSelectMultiple } from "react-icons/bi";
import { FiFileText, FiMusic } from "react-icons/fi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdDataArray } from "react-icons/md";
import { useBrowserSectionFileBrowserState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserTypeFilters,
} from "utils/fileBrowserTypes";
import { type BrowserSavedSearch } from "utils/generatedTypes";
import { normalizeFileBrowserTypeFilters } from "./browserAreaShared";

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;

const artifactTypes = [
  { type: "image" as const, label: "Image", icon: <IoImageOutline /> },
  { type: "video" as const, label: "Video", icon: <IoVideocam /> },
  { type: "audio" as const, label: "Audio", icon: <FiMusic /> },
  { type: "text" as const, label: "Text", icon: <FiFileText /> },
  { type: "data" as const, label: "Other", icon: <MdDataArray /> },
];

type BrowserAreaTypesColumnProps = {
  width: number;
  columnWidth: string;
  onResizeStart: React.MouseEventHandler<HTMLDivElement>;
  savedSearches: BrowserSavedSearch[];
};

function buildActiveTypeFilters(
  typeFilters: FileBrowserTypeFilters,
): typeof DEFAULT_FILE_BROWSER_TYPE_FILTERS {
  return {
    image: typeFilters.image === true,
    video: typeFilters.video === true,
    audio: typeFilters.audio === true,
    text: typeFilters.text === true,
    data: typeFilters.data === true,
  };
}

function buildSavedSearchTooltipText(search: BrowserSavedSearch): string {
  if ((search.quickInfo ?? "").trim().length > 0) {
    return search.quickInfo ?? "";
  }
  return [`Query: ${search.query || ""}`, `Scope: ${search.searchScope}`].join(
    "\n",
  );
}

function FilterToggleRow({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 justify-between">
      <button
        type="button"
        aria-pressed={checked}
        className="nodrag flex min-h-7 w-full min-w-0 items-center gap-2 bg-transparent px-1 py-0.5 text-left text-xs text-setta-700 transition-colors hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-200 dark:hover:text-white"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onChange(!checked);
        }}
      >
        {icon ? (
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center ${
              checked
                ? "text-blue-600 dark:text-blue-300"
                : "text-setta-400 dark:text-setta-500"
            }`}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    </li>
  );
}

function SavedSearchRow({
  search,
  isActive,
  onApply,
}: {
  search: BrowserSavedSearch;
  isActive: boolean;
  onApply: (search: BrowserSavedSearch) => void;
}) {
  const tooltipText = buildSavedSearchTooltipText(search);
  const tooltipHandlers =
    tooltipText.trim().length > 0
      ? getFloatingBoxHandlers({
          title: search.name || "Saved search",
          content: tooltipText,
        })
      : null;
  return (
    <li key={search.id} className="group/savedsearch">
      <button
        type="button"
        className={`nodrag flex min-h-6 w-full min-w-0 items-center gap-2 overflow-hidden rounded px-1 py-0.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-200 ${
          isActive
            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
            : "text-setta-700 hover:bg-setta-50 dark:hover:bg-setta-900"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onApply(search);
        }}
        {...(tooltipHandlers ?? {})}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: search.color || "#3b82f6" }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">
          {search.name || search.query || "Saved search"}
        </span>
      </button>
    </li>
  );
}

export function BrowserAreaTypesColumn({
  width,
  columnWidth,
  onResizeStart,
  savedSearches,
}: BrowserAreaTypesColumnProps) {
  const { ref, isScrollable } = useIsScrollable();
  const { filterText, typeFilters, searchScope } =
    useBrowserSectionFileBrowserState((state) => ({
      filterText: state.filterText,
      typeFilters: state.typeFilters,
      searchScope: state.searchScope,
    }));
  const activeTypeFilters = useMemo(
    () => buildActiveTypeFilters(typeFilters),
    [typeFilters],
  );
  const applySavedSearch = useCallback((search: BrowserSavedSearch) => {
    useBrowserSectionFileBrowserState.setState({
      filterText: search.query ?? "",
      searchScope: search.searchScope,
      typeFilters: normalizeFileBrowserTypeFilters(search.typeFilters),
    });
  }, []);
  const resetTypeFilters = useCallback(() => {
    useBrowserSectionFileBrowserState.setState({
      typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    });
  }, []);
  const isResizable = width > TYPES_COLUMN_MIN_CONTAINER_WIDTH;
  return (
    <article
      className="nodrag relative flex min-w-0 flex-col pr-1 @sm/multipane:z-20"
      style={isResizable ? { width: columnWidth } : undefined}
    >
      {isResizable ? (
        <div className="absolute -right-2 top-0 z-30 flex h-full items-center">
          <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        </div>
      ) : null}
      <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
        Filters
      </h3>

      <ul
        ref={ref}
        className={`relative mb-2 mt-2 box-border flex min-h-0 min-w-0 flex-1 list-none flex-col overflow-y-auto overflow-x-hidden pr-1 ${isScrollable ? "nowheel" : ""}`}
      >
        {artifactTypes.map((artifactType) => (
          <FilterToggleRow
            key={artifactType.type}
            icon={artifactType.icon}
            checked={typeFilters[artifactType.type] === true}
            onChange={(checked) => {
              useBrowserSectionFileBrowserState.setState((state) => ({
                typeFilters: {
                  ...state.typeFilters,
                  [artifactType.type]: checked,
                },
              }));
            }}
            label={artifactType.label}
          />
        ))}
        {savedSearches.length > 0 ? (
          <li className="my-2 h-px w-full bg-setta-100 dark:bg-setta-800" />
        ) : null}
        {savedSearches.map((search) => (
          <SavedSearchRow
            key={search.id}
            search={search}
            isActive={
              filterText === (search.query ?? "") &&
              searchScope === search.searchScope &&
              _.isEqual(
                activeTypeFilters,
                normalizeFileBrowserTypeFilters(search.typeFilters),
              )
            }
            onApply={applySavedSearch}
          />
        ))}
      </ul>

      <button
        type="button"
        className="nodrag mt-auto flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-2 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:!border-blue-500 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400"
        onClick={resetTypeFilters}
      >
        <BiSolidSelectMultiple />
        Select All
      </button>
    </article>
  );
}
