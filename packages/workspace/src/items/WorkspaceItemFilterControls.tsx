import { FiX } from "react-icons/fi";
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext";
import { useWorkspaceHost } from "../workspaceHostContext";
import { getWorkspaceHostDomId } from "../workspaceHostInternals";

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

export function WorkspaceItemFilterControls({
  sectionId,
}: {
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const filter = useWorkspaceItemFilter();
  if (!filter) {
    return null;
  }
  const hostId = getWorkspaceHostDomId(host);
  const inputId = `${hostId}-${sectionId}-parameter-filter`;
  const statusId = `${hostId}-${sectionId}-parameter-filter-status`;
  const hiddenSelectionMessage = `${formatCount(
    filter.hiddenSelectedItemCount,
    "selected parameter is",
    "selected parameters are",
  )} hidden by this filter.`;
  const statusMessage = buildFilterStatusMessage(filter);
  const sortIconToneClassName = filter.hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 dark:text-setta-600";
  const inputToneClassName = filter.hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-text)] placeholder:text-[color:var(--setta-section-style-muted-text)] focus-visible:border-[color:var(--setta-section-style-outline)]"
    : "text-setta-700 placeholder:text-setta-400 focus-visible:border-blue-300 dark:text-setta-300";
  const clearToneClassName = filter.hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)]"
    : "text-setta-500 hover:text-setta-700 dark:text-setta-400 dark:hover:text-setta-200";
  const hiddenSelectionToneClassName = filter.hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-text)]"
    : "text-setta-600 dark:text-setta-300";

  return (
    <>
      <search className="nodrag relative mx-2 flex min-w-8 flex-1 items-center justify-self-center">
        <label className="sr-only" htmlFor={inputId}>
          Filter parameters
        </label>
        <i
          aria-hidden={true}
          className={`gg-sort-az -me-2 ${sortIconToneClassName}`}
        />
        <input
          aria-describedby={statusId}
          autoComplete="off"
          className={`setta-workspace-item-filter-input min-w-0 flex-1 cursor-auto truncate border-solid border-transparent bg-transparent py-1 ps-3 text-xs [border-width:0_0_1px_0] ${inputToneClassName}`}
          id={inputId}
          onChange={(event) => filter.setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          placeholder="Filter"
          ref={filter.filterInputRef}
          spellCheck={false}
          type="text"
          value={filter.query}
        />
        {filter.query.length > 0 ? (
          <button
            aria-label="Clear parameter filter"
            className={`ms-1 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 ${clearToneClassName}`}
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
        <p
          className={`basis-full flex min-w-0 flex-wrap items-center gap-x-1 px-2 pb-1 text-[10px] leading-tight ${hiddenSelectionToneClassName}`}
        >
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
