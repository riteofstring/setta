import { MdFlipToFront, MdOpenInNew } from "react-icons/md";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

const DEFAULT_BUTTON_CLASS_NAME =
  "nodrag me-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-500 transition focus-visible:ring-2 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100";
const THEMED_BUTTON_CLASS_NAME =
  "nodrag me-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[color:var(--setta-section-style-muted-text)] transition focus-visible:ring-2 focus-visible:ring-[var(--setta-section-style-outline)] hover:bg-[color:var(--setta-section-style-bg)] hover:text-[color:var(--setta-section-style-outline)]";

export type WorkspaceSectionWindowToggleButtonProps = {
  sectionId: string;

  sectionWindowingSupported: boolean;

  layoutEditable: boolean;

  hasOpenExternalWindow: boolean;
  hasSectionStyleTheme?: boolean;
  onOpenInFloatingWindow: (sectionId: string) => void;
  onShowInCanvas: (sectionId: string) => void;
};

export function WorkspaceSectionWindowToggleButton({
  hasOpenExternalWindow,
  hasSectionStyleTheme = false,
  layoutEditable,
  onOpenInFloatingWindow,
  onShowInCanvas,
  sectionId,
  sectionWindowingSupported,
}: WorkspaceSectionWindowToggleButtonProps) {
  const host = useWorkspaceHost();
  if (!layoutEditable || !sectionWindowingSupported) {
    return null;
  }

  const label = hasOpenExternalWindow
    ? "Show section in canvas"
    : "Open section in floating window";
  const className = hasSectionStyleTheme
    ? THEMED_BUTTON_CLASS_NAME
    : DEFAULT_BUTTON_CLASS_NAME;

  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      data-section-id={sectionId}
      data-setta-workspace-touch-target="compact"
      data-testid="section-window-toggle"
      data-workspace-section-window-toggle-mode={
        hasOpenExternalWindow ? "show-in-canvas" : "open-in-window"
      }
      onClick={() => {
        if (hasOpenExternalWindow) {
          onShowInCanvas(sectionId);
          return;
        }
        onOpenInFloatingWindow(sectionId);
      }}
      title={label}
      {...getWorkspaceTooltipHandlers(host, { content: label })}
    >
      {hasOpenExternalWindow ? (
        <MdFlipToFront aria-hidden="true" size={12} />
      ) : (
        <MdOpenInNew aria-hidden="true" size={12} />
      )}
    </button>
  );
}
