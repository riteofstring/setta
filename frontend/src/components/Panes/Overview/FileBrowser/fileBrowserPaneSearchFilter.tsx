import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { createFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect, useId, useMemo, useState } from "react";
import { FiSave } from "react-icons/fi";
import { HiChevronDown } from "react-icons/hi";
import { TbFolder, TbFolders } from "react-icons/tb";
import { useFileBrowserState } from "state/stores/fileBrowserStores";
import { NO_PAN_CLASS_NAME } from "utils/constants";

const FILTER_DEBOUNCE_MS = 150;

// Owns the file-browser search field, save action, and search-scope popover.
export function FileBrowserFilter({
  useFileBrowserStateHook,
  className,
  tooltipParentDivId,
  saveSearchConfig,
}: {
  useFileBrowserStateHook?: typeof useFileBrowserState;
  className?: string;
  tooltipParentDivId?: string | null;
  saveSearchConfig?: {
    canSave: boolean;
    onSaveSearch: (query: string) => void;
  } | null;
}) {
  const fileBrowserState = useFileBrowserStateHook ?? useFileBrowserState;
  const { filterText, rootPath, pathSeparator, ignorePatterns, searchScope } =
    fileBrowserState((state) => ({
      filterText: state.filterText,
      rootPath: state.rootPath,
      pathSeparator: state.pathSeparator,
      ignorePatterns: state.ignorePatterns,
      searchScope: state.searchScope,
    }));
  const [filterInput, setFilterInput] = useState(filterText);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const inputId = useId();
  const completionSource = useMemo(
    () =>
      createFolderPathCompletionSource({
        rootPath,
        pathSeparator,
        ignorePatterns,
      }),
    [rootPath, pathSeparator, ignorePatterns],
  );

  useEffect(() => {
    setFilterInput(filterText);
  }, [filterText]);

  useEffect(() => {
    if (!searchMenuOpen) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    // ReactFlow pans/zooms via CSS transforms. Radix Popover doesn't automatically
    // reposition on transform changes when the content is portaled to `document.body`,
    // so we dispatch a synthetic scroll/resize event while the menu is open.
    let rafId: number | null = null;
    const scheduleReposition = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
      });
    };

    scheduleReposition();

    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform,
      () => scheduleReposition(),
    );

    return () => {
      unsubscribe();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [searchMenuOpen]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fileBrowserState.setState({ filterText: filterInput });
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [filterInput, fileBrowserState]);

  const keyComboActions = useMemo(
    () => ({
      Escape: () => {
        if (typeof document !== "undefined") {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        }
        return true;
      },
    }),
    [],
  );

  const dummyInputClassName =
    "min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-3 pr-12 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 font-sans";
  const realInputClassName =
    "min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent outline-0 [border-width:0_0_1px_0] focus-within:border-blue-300 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-3 [&_.cm-content]:!pr-12 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-300 [&_.cm-placeholder]:text-setta-400 dark:[&_.cm-placeholder]:text-setta-600 [&_.cm-content]:font-sans";
  const canShowSaveButton = (saveSearchConfig?.canSave ?? false) === true;
  const hasSearchValue = filterInput.trim().length > 0;

  return (
    <search
      className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 flex-1 items-center ${className ?? ""}`}
    >
      <i className="gg-sort-az -mr-2 text-setta-300 dark:text-setta-600" />
      <InlineCodeMirrorInput
        id={`CodeMirror-FileBrowserFilter-${inputId}`}
        value={filterInput}
        placeholder="Search"
        onChange={setFilterInput}
        className={realInputClassName}
        dummyClassName={dummyInputClassName}
        singleLine
        completionsFn={completionSource ?? undefined}
        keyComboActions={keyComboActions}
        tooltipParentDivId={tooltipParentDivId}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {saveSearchConfig && hasSearchValue ? (
          <button
            type="button"
            aria-label="Save search"
            title="Save search"
            className={`nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-40 ${
              canShowSaveButton
                ? "bg-transparent text-setta-400 hover:bg-setta-50 dark:text-setta-500 dark:hover:bg-setta-800"
                : "bg-transparent text-setta-300 dark:text-setta-700"
            }`}
            disabled={!canShowSaveButton}
            onClick={() => {
              if (!canShowSaveButton) {
                return;
              }
              saveSearchConfig.onSaveSearch(filterInput);
            }}
          >
            <FiSave size={14} />
          </button>
        ) : null}

        <StandardPopover
          open={searchMenuOpen}
          onOpenChange={setSearchMenuOpen}
          arrowClasses="h-2 w-4 -translate-y-px fill-white/95 stroke-setta-200/80 stroke-1 dark:fill-setta-900/95 dark:stroke-setta-700/70"
          contentClasses="z-[320] w-[252px] overflow-visible rounded-xl border border-solid border-setta-200/80 bg-white/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.6)] ring-1 ring-white/70 backdrop-blur outline-none dark:border-setta-700/70 dark:bg-setta-900/95 dark:ring-setta-800/60"
          contentProps={{
            sideOffset: 8,
            collisionPadding: 16,
            align: "center",
            // React Flow pans via CSS transforms; keep the menu anchored while panning.
            updatePositionStrategy: "always",
          }}
          trigger={
            <button
              type="button"
              aria-label="Search scope options"
              className={`nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-setta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 dark:hover:bg-setta-800 ${
                searchMenuOpen
                  ? "bg-blue-100 text-blue-600 dark:bg-transparent dark:text-blue-600"
                  : "bg-transparent text-setta-400 dark:text-setta-500"
              }`}
            >
              <HiChevronDown size={14} />
            </button>
          }
        >
          <div className="overflow-hidden rounded-[inherit] p-2.5">
            <div className="flex flex-col gap-1.5 text-xs text-setta-700 dark:text-setta-200">
              <button
                type="button"
                aria-pressed={searchScope === "recursive"}
                className={`box-border w-full rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
                  searchScope === "recursive"
                    ? "bg-blue-100/80 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/50"
                    : "text-setta-700 hover:bg-setta-50 dark:text-setta-200 dark:hover:bg-setta-850"
                }`}
                onClick={() => {
                  fileBrowserState.setState({ searchScope: "recursive" });
                  setSearchMenuOpen(false);
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center text-current">
                    <TbFolders size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">
                      Recursive search
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-setta-400 dark:text-setta-500">
                      Search the current folder and nested folders.
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                aria-pressed={searchScope === "local"}
                className={`box-border w-full rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
                  searchScope === "local"
                    ? "bg-blue-100/80 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/50"
                    : "text-setta-700 hover:bg-setta-50 dark:text-setta-200 dark:hover:bg-setta-850"
                }`}
                onClick={() => {
                  fileBrowserState.setState({ searchScope: "local" });
                  setSearchMenuOpen(false);
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center text-current">
                    <TbFolder size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">
                      Local search
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-setta-400 dark:text-setta-500">
                      Search only the current folder.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </StandardPopover>
      </div>
    </search>
  );
}
