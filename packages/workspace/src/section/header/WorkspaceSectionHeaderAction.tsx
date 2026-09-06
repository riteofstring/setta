import type { ReactNode } from "react";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";
import { useWorkspaceHost } from "../../workspaceHostContext";

const DEFAULT_CLASS_NAME =
  "nodrag me-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-600 transition focus-visible:ring-2 hover:bg-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-300";
const THEMED_CLASS_NAME =
  "nodrag me-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-[color:var(--setta-section-style-muted-text)] transition focus-visible:ring-2 focus-visible:ring-[var(--setta-section-style-outline)] hover:bg-[color:var(--setta-section-style-bg)] hover:text-[color:var(--setta-section-style-outline)] disabled:cursor-not-allowed disabled:opacity-50";

export type WorkspaceSectionHeaderActionProps = {
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
  hasSectionStyleTheme?: boolean;
  label: string;
  onClick: () => void;
  tooltip?: string;
};

export function WorkspaceSectionHeaderAction({
  busy = false,
  children,
  disabled = false,
  hasSectionStyleTheme = false,
  label,
  onClick,
  tooltip = label,
}: WorkspaceSectionHeaderActionProps) {
  const host = useWorkspaceHost();
  return (
    <button
      aria-busy={busy || undefined}
      aria-label={label}
      className={hasSectionStyleTheme ? THEMED_CLASS_NAME : DEFAULT_CLASS_NAME}
      data-setta-workspace-touch-target="compact"
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
      type="button"
      {...getWorkspaceTooltipHandlers(host, { content: tooltip })}
    >
      {children}
    </button>
  );
}
