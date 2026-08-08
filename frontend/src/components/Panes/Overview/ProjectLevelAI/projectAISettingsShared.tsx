import { type ReactNode } from "react";

export const INPUT_CLASS_NAME =
  "box-border h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
export const TEXTAREA_CLASS_NAME =
  "box-border min-h-[110px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600";
export const SELECT_CLASS_NAME =
  "box-border h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
export const MANAGER_LIST_CLASS_NAME =
  "flex max-h-[360px] flex-col gap-1 overflow-x-hidden overflow-y-scroll rounded-md bg-setta-50/45 pl-2 pr-3 py-2 [scrollbar-gutter:stable] dark:bg-setta-900/40";
export const MANAGER_FORM_CLASS_NAME =
  "flex min-h-0 flex-1 flex-col gap-4 rounded-md bg-white/45 p-4 dark:bg-setta-900/30";
export const PRIMARY_ACTION_BUTTON_CLASS_NAME =
  "h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60";
export const SECONDARY_ACTION_BUTTON_CLASS_NAME =
  "h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200";
export const DANGER_ACTION_BUTTON_CLASS_NAME =
  "h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
};

export function resolveManagerItemClassName(isActive: boolean): string {
  let className = "rounded-md px-2 py-2 text-left text-xs transition-colors";
  if (isActive) {
    className += " bg-blue-600 text-white dark:bg-blue-700";
    return className;
  }
  className += " hover:bg-setta-50 dark:hover:bg-setta-800/60";
  return className;
}

export function parseListInput(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {label}
      </span>
      {children}
      {hint ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-400">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
