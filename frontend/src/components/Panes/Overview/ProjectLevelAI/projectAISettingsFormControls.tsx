import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
};

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
