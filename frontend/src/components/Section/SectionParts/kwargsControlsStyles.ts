type KwargsControlsContainerClassNameOptions = {
  hasSectionStyleTheme: boolean;
  isCallableSection: boolean;
};

function joinClassNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export function getKwargsControlsContainerClassName({
  hasSectionStyleTheme,
  isCallableSection,
}: KwargsControlsContainerClassNameOptions): string {
  const argsBackgroundClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-bg)]"
    : isCallableSection
      ? "bg-setta-50 dark:bg-setta-860"
      : "";
  const argsBorderColorClassName = hasSectionStyleTheme
    ? "border-[color:var(--setta-section-style-border)]"
    : "border-white dark:border-setta-700";

  return joinClassNames(
    "section-args z-10 flex min-w-0 flex-wrap rounded-xl border-b border-solid px-1 shadow-sm @container overflow-hidden isolate",
    isCallableSection ? "mt-0 pb-0" : "mt-1 pb-1",
    argsBackgroundClassName,
    argsBorderColorClassName,
  );
}
