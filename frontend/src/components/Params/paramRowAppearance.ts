function resolveParamSelectionClass(hasSectionStyleTheme: boolean) {
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";

  return `transition-colors rounded-sm ${selectedBgClassName}`;
}

export function resolveParamBackgroundClass({
  hasSectionStyleTheme,
  paramIsSelected,
}: {
  hasSectionStyleTheme: boolean;
  paramIsSelected: boolean;
}) {
  if (!paramIsSelected) {
    return "transition-colors rounded-sm";
  }

  return resolveParamSelectionClass(hasSectionStyleTheme);
}

export function resolveParamBorderClass({
  hasError,
  isFocusedSearchResult,
  isSearchResult,
}: {
  hasError: boolean;
  isFocusedSearchResult: boolean;
  isSearchResult: boolean;
}) {
  if (hasError) {
    return "bg-red-200 dark:bg-red-800/30";
  }
  if (isFocusedSearchResult) {
    return "outline outline-4 outline-green-500 dark:outline-green-500/80";
  }
  if (isSearchResult) {
    return "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }
  return "";
}
