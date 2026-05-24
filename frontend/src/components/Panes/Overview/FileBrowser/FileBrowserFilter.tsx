import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { createFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect, useId, useMemo, useState } from "react";
import { FiSave } from "react-icons/fi";
import { HiChevronDown } from "react-icons/hi";
import { TbFolder, TbFolders } from "react-icons/tb";
import { useFileBrowserState } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";
import {
  FILTER_DEBOUNCE_MS,
  type FileBrowserFilterProps,
} from "./fileBrowserPaneShared";

type SearchScopeOptionConfig = {
  value: FileBrowserSearchScope;
  icon: typeof TbFolder;
  title: string;
  description: string;
};

const SEARCH_SCOPE_OPTIONS: SearchScopeOptionConfig[] = [
  {
    value: "recursive",
    icon: TbFolders,
    title: "Recursive search",
    description: "Search the current folder and nested folders.",
  },
  {
    value: "local",
    icon: TbFolder,
    title: "Local search",
    description: "Search only the current folder.",
  },
];

function useSearchMenuReposition(searchMenuOpen: boolean): void {
  useEffect(() => {
    if (!searchMenuOpen || typeof window === "undefined") {
      return;
    }
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
}

function SearchScopeOption(args: {
  value: FileBrowserSearchScope;
  icon: typeof TbFolder;
  title: string;
  description: string;
  selected: boolean;
  onSelect: (scope: FileBrowserSearchScope) => void;
}): JSX.Element {
  const Icon = args.icon;
  return (
    <button
      type="button"
      aria-pressed={args.selected}
      className={`box-border w-full rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
        args.selected
          ? "bg-blue-100/80 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/50"
          : "text-setta-700 hover:bg-setta-50 dark:text-setta-200 dark:hover:bg-setta-850"
      }`}
      onClick={() => args.onSelect(args.value)}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center text-current">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{args.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-setta-400 dark:text-setta-500">
            {args.description}
          </div>
        </div>
      </div>
    </button>
  );
}

function SaveSearchButton(args: {
  enabled: boolean;
  onSave: () => void;
  visible: boolean;
}): JSX.Element | null {
  if (!args.visible) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label="Save search"
      title="Save search"
      className={`nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-40 ${
        args.enabled
          ? "bg-transparent text-setta-400 hover:bg-setta-50 dark:text-setta-500 dark:hover:bg-setta-800"
          : "bg-transparent text-setta-300 dark:text-setta-700"
      }`}
      disabled={!args.enabled}
      onClick={args.onSave}
    >
      <FiSave size={14} />
    </button>
  );
}

function SearchScopePopover(args: {
  onOpenChange: (nextOpen: boolean) => void;
  onSelect: (scope: FileBrowserSearchScope) => void;
  open: boolean;
  searchScope: FileBrowserSearchScope;
}): JSX.Element {
  return (
    <StandardPopover
      open={args.open}
      onOpenChange={args.onOpenChange}
      arrowClasses="h-2 w-4 -translate-y-px fill-white/95 stroke-setta-200/80 stroke-1 dark:fill-setta-900/95 dark:stroke-setta-700/70"
      contentClasses="z-[320] w-[252px] overflow-visible rounded-xl border border-solid border-setta-200/80 bg-white/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.6)] ring-1 ring-white/70 backdrop-blur outline-none dark:border-setta-700/70 dark:bg-setta-900/95 dark:ring-setta-800/60"
      contentProps={{
        sideOffset: 8,
        collisionPadding: 16,
        align: "center",
        updatePositionStrategy: "always",
      }}
      trigger={
        <button
          type="button"
          aria-label="Search scope options"
          className={`nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-setta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 dark:hover:bg-setta-800 ${
            args.open
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
          {SEARCH_SCOPE_OPTIONS.map((option) => (
            <SearchScopeOption
              key={option.value}
              value={option.value}
              icon={option.icon}
              title={option.title}
              description={option.description}
              selected={args.searchScope === option.value}
              onSelect={args.onSelect}
            />
          ))}
        </div>
      </div>
    </StandardPopover>
  );
}

export function FileBrowserFilter({
  useFileBrowserStateHook,
  className,
  tooltipParentDivId,
  saveSearchConfig,
}: FileBrowserFilterProps) {
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
  useSearchMenuReposition(searchMenuOpen);

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
    const timeout = setTimeout(() => {
      fileBrowserState.setState({ filterText: filterInput });
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [filterInput, fileBrowserState]);

  const canShowSaveButton = (saveSearchConfig?.canSave ?? false) === true;
  const hasSearchValue = filterInput.trim().length > 0;
  const showSaveButton = saveSearchConfig != null && hasSearchValue;
  const handleSave = () => {
    if (!canShowSaveButton || !saveSearchConfig) {
      return;
    }
    saveSearchConfig.onSaveSearch(filterInput);
  };
  const handleSearchScopeChange = (nextScope: FileBrowserSearchScope) => {
    fileBrowserState.setState({ searchScope: nextScope });
    setSearchMenuOpen(false);
  };

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
        className="min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent outline-0 [border-width:0_0_1px_0] focus-within:border-blue-300 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-3 [&_.cm-content]:!pr-12 [&_.cm-content]:font-sans [&_.cm-content]:text-xs [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-300 [&_.cm-line]:!px-0 [&_.cm-placeholder]:text-setta-400 dark:[&_.cm-placeholder]:text-setta-600"
        dummyClassName="min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-3 pr-12 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 font-sans"
        singleLine
        completionsFn={completionSource ?? undefined}
        keyComboActions={{
          Escape: () => {
            if (typeof document === "undefined") {
              return true;
            }
            const active = document.activeElement;
            if (active instanceof HTMLElement) {
              active.blur();
            }
            return true;
          },
        }}
        tooltipParentDivId={tooltipParentDivId}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        <SaveSearchButton
          visible={showSaveButton}
          enabled={canShowSaveButton}
          onSave={handleSave}
        />
        <SearchScopePopover
          open={searchMenuOpen}
          onOpenChange={setSearchMenuOpen}
          onSelect={handleSearchScopeChange}
          searchScope={searchScope}
        />
      </div>
    </search>
  );
}
