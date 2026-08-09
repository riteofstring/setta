import type { ReactNode } from "react";

export function MetaControlTitleStack({
  showSectionTitle,
  sectionName,
  children,
  containerClassName,
  contentClassName,
  titleClassName,
}: {
  showSectionTitle: boolean;
  sectionName: string;
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
}) {
  const showTitle = showSectionTitle && sectionName.trim().length > 0;
  return (
    <div className={`relative h-full min-h-0 w-full min-w-0 ${containerClassName ?? ""}`}>
      {showTitle ? (
        <span
          className={`pointer-events-none absolute left-0 top-0 z-10 -translate-y-full truncate text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400 ${titleClassName ?? ""}`}
        >
          {sectionName}
        </span>
      ) : null}
      <div className={`flex h-full min-h-0 w-full min-w-0 ${contentClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
