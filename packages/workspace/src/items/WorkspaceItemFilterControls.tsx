import { FiSearch, FiX } from "react-icons/fi";
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext";

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildFilterStatusMessage({
  filterActive,
  hiddenSelectedItemCount,
  matchingItemCount,
}: {
  filterActive: boolean;
  hiddenSelectedItemCount: number;
  matchingItemCount: number;
}): string {
  if (!filterActive) {
    return "";
  }
  const matches = `${formatCount(matchingItemCount, "matching parameter", "matching parameters")}.`;
  if (hiddenSelectedItemCount === 0) {
    return matches;
  }
  return `${matches} ${formatCount(
    hiddenSelectedItemCount,
    "selected parameter is",
    "selected parameters are",
  )} hidden by this filter.`;
}

export function WorkspaceItemFilterControls({ sectionId }: { sectionId: string }) {
  const filter = useWorkspaceItemFilter();
  if (!filter) {
    return null;
  }
  const inputId = `${sectionId}-parameter-filter`;
  const statusId = `${sectionId}-parameter-filter-status`;
  const hiddenSelectionMessage = `${formatCount(
    filter.hiddenSelectedItemCount,
    "selected parameter is",
    "selected parameters are",
  )} hidden by this filter.`;
  const statusMessage = buildFilterStatusMessage(filter);

  return (
    <>
      <search className="nodrag relative flex min-w-0 items-center pb-1 text-setta-500 dark:text-setta-400">
        <label className="sr-only" htmlFor={inputId}>
          Filter parameters
        </label>
        <FiSearch aria-hidden={true} className="me-1 h-3 w-3 shrink-0" focusable="false" />
        <input
          aria-describedby={statusId}
          autoComplete="off"
          className="min-w-0 flex-1 appearance-none border-0 border-b border-solid border-setta-200 bg-transparent px-0 py-1 text-xs text-setta-700 outline-offset-1 placeholder:text-setta-400 focus-visible:border-blue-400 focus-visible:outline-2 dark:border-setta-700 dark:text-setta-300 dark:placeholder:text-setta-500"
          id={inputId}
          onChange={(event) => filter.setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          placeholder="Name or keyword"
          ref={filter.filterInputRef}
          spellCheck={false}
          type="search"
          value={filter.query}
        />
        {filter.query.length > 0 ? (
          <button
            aria-label="Clear parameter filter"
            className="ms-1 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-setta-500 focus-visible:outline-2 focus-visible:outline-offset-1 hover:text-setta-700 dark:text-setta-400 dark:hover:text-setta-200"
            data-setta-workspace-touch-target="compact"
            onClick={filter.clearAndFocus}
            title="Clear parameter filter"
            type="button"
          >
            <FiX aria-hidden={true} className="h-3 w-3" focusable="false" />
          </button>
        ) : null}
      </search>
      {filter.hiddenSelectedItemCount > 0 ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 pb-1 text-[10px] leading-tight text-setta-600 dark:text-setta-300">
          <span>{hiddenSelectionMessage}</span>
          <button
            className="min-h-6 rounded-sm px-1 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1"
            onClick={filter.clearAndFocus}
            type="button"
          >
            Clear filter
          </button>
        </p>
      ) : null}
      <span className="sr-only" id={statusId} role="status">
        {statusMessage}
      </span>
    </>
  );
}
