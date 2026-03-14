import type { CompletionSource } from "@codemirror/autocomplete";
import { useCallback, useMemo } from "react";
import { HiChevronRight } from "react-icons/hi";
import { TbArrowUp, TbFolder } from "react-icons/tb";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { normalizeFileBrowserPathForComparison } from "utils/fileBrowserPathRelation";
import type { FileBrowserBreadcrumb } from "utils/fileBrowserNavigation";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { InlineCodeMirrorInput } from "./CodeMirror/InlineCodeMirrorInput";

export function FileBrowserPathInput({
  inputId,
  value,
  onCommit,
  completionSource,
  dataTestId,
}: {
  inputId: string;
  value: string;
  onCommit: (nextValue: string) => void;
  completionSource: CompletionSource | null;
  dataTestId?: string;
}) {
  const { inputValue, onChange, onBlur, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(value, onCommit, () => true);

  const blurActiveElement = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, []);

  const keyComboActions = useMemo(
    () => ({
      Escape: () => {
        blurTriggeredByEscapeKey.current = true;
        onChange(value);
        blurActiveElement();
        return true;
      },
    }),
    [blurActiveElement, blurTriggeredByEscapeKey, onChange, value],
  );

  const dummyInputStyles =
    "flex-1 min-w-0 cursor-text truncate bg-transparent pl-6 py-1 text-xs leading-4 outline-0 placeholder-setta-300 dark:placeholder-setta-700 font-sans";
  const realInputStyles =
    "setta-cm-browser-path-input flex-1 min-w-0 h-full cursor-text truncate bg-transparent outline-0 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-6 [&_.cm-content]:!pr-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:!leading-4 [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-200 [&_.cm-placeholder]:text-setta-300 dark:[&_.cm-placeholder]:text-setta-700 [&_.cm-content]:font-sans";

  return (
    <search
      data-testid={dataTestId}
      className="nodrag group/folderpath relative mx-[2px] flex h-7 min-w-0 flex-1 overflow-hidden border-solid border-transparent bg-transparent [border-width:0_0_1px_0] focus-within:border-blue-300 dark:text-setta-200"
    >
      <TbFolder
        className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-setta-400 dark:text-setta-600"
        size={14}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 transition-opacity duration-0 group-focus-within/folderpath:opacity-0 group-focus-within/folderpath:duration-150"
      >
        <span className="block min-w-0 truncate py-1 pl-6 font-sans text-xs leading-4 text-setta-700 dark:text-setta-200">
          {inputValue}
        </span>
      </div>
      <InlineCodeMirrorInput
        id={inputId}
        value={inputValue}
        onChange={onChange}
        onBlur={(nextValue) => {
          void onBlur(nextValue);
        }}
        onEnter={(_, completionResult) => {
          // Enter in the path field should commit navigation and close autocomplete when appropriate.
          if (!completionResult) {
            blurActiveElement();
          }
        }}
        className={realInputStyles}
        dummyClassName={dummyInputStyles}
        singleLine
        completionsFn={completionSource ?? undefined}
        completionInteractionDelayMs={0}
        completionTriggerChars={["/", "\\"]}
        keyComboActions={keyComboActions}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
    </search>
  );
}

export function FileBrowserGoUpButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="file-browser-go-up-button"
      aria-label="Go up one level"
      className="nodrag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-setta-200/80 bg-white/80 text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-800 dark:bg-setta-950/60 dark:text-setta-300 dark:hover:bg-setta-900 dark:hover:text-setta-100"
      disabled={disabled}
      onClick={onClick}
    >
      <TbArrowUp size={14} />
    </button>
  );
}

export function FileBrowserBreadcrumbs({
  breadcrumbs,
  currentPath,
  onSelect,
  className,
}: {
  breadcrumbs: FileBrowserBreadcrumb[];
  currentPath: string;
  onSelect: (path: string) => void;
  className?: string;
}) {
  if (breadcrumbs.length === 0) {
    return null;
  }

  const normalizedCurrentPath =
    normalizeFileBrowserPathForComparison(currentPath);

  return (
    <nav
      data-testid="file-browser-breadcrumbs"
      aria-label="Folder breadcrumbs"
      className={`nodrag flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[11px] text-setta-500 dark:text-setta-400 ${className ?? ""}`}
    >
      {breadcrumbs.map((breadcrumb, index) => {
        const isCurrent =
          normalizeFileBrowserPathForComparison(breadcrumb.path) ===
          normalizedCurrentPath;
        return (
          <div key={breadcrumb.path} className="flex min-w-0 items-center gap-1">
            {index > 0 ? (
              <HiChevronRight
                className="shrink-0 text-setta-300 dark:text-setta-600"
                size={11}
              />
            ) : null}
            {isCurrent ? (
              <span
                aria-current="location"
                className="truncate rounded-full bg-setta-100 px-2 py-0.5 font-medium text-setta-700 dark:bg-setta-900 dark:text-setta-200"
                title={breadcrumb.path}
              >
                {breadcrumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="truncate rounded-full px-2 py-0.5 text-left transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 dark:hover:bg-setta-900 dark:hover:text-setta-100"
                title={breadcrumb.path}
                onClick={() => onSelect(breadcrumb.path)}
              >
                {breadcrumb.label}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
