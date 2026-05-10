import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

export const TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS =
  "absolute grid min-w-0 [&_.section-value]:col-[1/-1] [&_.section-value]:row-[1/-1]";

export function dummyCodeClass(
  hasError: boolean,
  interactive: boolean,
  isDisabled: boolean,
): string {
  return [
    NO_PAN_CLASS_NAME,
    "section-value self-end peer/textinput",
    hasError ? "[&_*]:!text-red-500" : "",
    NO_DRAG_CLASS_NAME,
    interactive && !isDisabled ? "cursor-text select-text" : "",
    "break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]",
    isDisabled ? "text-setta-400 dark:text-setta-500" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function realCodeClass(hasError: boolean): string {
  return [
    NO_PAN_CLASS_NAME,
    NO_DRAG_CLASS_NAME,
    "self-end peer/textinput",
    hasError ? "[&_*]:!text-red-500" : "",
    "[&_*]:!outline-0 cursor-text select-text",
    "[&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10",
    "[&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs",
    "section-value py-[.125rem]",
  ]
    .filter(Boolean)
    .join(" ");
}
