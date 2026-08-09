export function PlanModeBadge({ className }: { className?: string }) {
  const baseClassName =
    "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300";
  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;
  return <span className={combinedClassName}>Plan mode</span>;
}
