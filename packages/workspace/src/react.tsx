import type { HTMLAttributes, ReactNode } from "react";

export type WorkspaceProps = Omit<HTMLAttributes<HTMLElement>, "aria-label" | "children"> & {
  ariaLabel?: string;
  children?: ReactNode;
  emptyState?: ReactNode;
};

export function Workspace({
  ariaLabel = "Workspace",
  children,
  className,
  emptyState = "No sections yet.",
  ...sectionProps
}: WorkspaceProps) {
  const resolvedClassName = ["setta-workspace", className].filter(Boolean).join(" ");

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-setta-workspace=""
    >
      {children ?? <p className="setta-workspace__empty">{emptyState}</p>}
    </section>
  );
}
