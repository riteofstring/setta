import { RiExternalLinkLine } from "react-icons/ri";
import { useWorkspaceDocument } from "../document/stores.js";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

export type WorkspaceSectionWindowPlaceholderProps = {
  sectionId: string;

  windowId: string;

  layoutEditable: boolean;

  onFocusWindow: (windowId: string) => void;

  onShowInCanvas: (windowId: string) => void;
  dataTestId?: string;
};

export function WorkspaceSectionWindowPlaceholder({
  dataTestId = "section-window-placeholder",
  layoutEditable,
  onFocusWindow,
  onShowInCanvas,
  sectionId,
  windowId,
}: WorkspaceSectionWindowPlaceholderProps) {
  const host = useWorkspaceHost();
  const sectionName = useWorkspaceDocument(
    (state) => state.sections[sectionId]?.name ?? "Section",
  );
  const explanatoryCopy = layoutEditable
    ? "Focus the external window or return this section to the canvas."
    : "Focus the external window from here.";
  const focusWindowTitle = `Focus ${sectionName} window`;
  const showInCanvasTitle = `Show ${sectionName} in canvas`;

  return (
    <div
      className="section-main-full-w flex min-h-0 flex-1 flex-col"
      data-testid={dataTestId}
      data-workspace-section-id={sectionId}
      data-workspace-section-window-id={windowId}
      data-workspace-section-window-placeholder="true"
    >
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed border-setta-300/80 bg-setta-100/45 dark:border-setta-600/80 dark:bg-setta-900/35">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-setta-300/20 via-setta-200/20 to-transparent dark:from-setta-600/15 dark:via-setta-700/10 dark:to-transparent" />
        <div className="pointer-events-auto relative flex max-w-[24rem] flex-col items-center gap-2 rounded-xl border border-setta-300/70 bg-white/80 px-5 py-4 text-center shadow-sm dark:border-setta-600/70 dark:bg-setta-925/80">
          <RiExternalLinkLine
            aria-hidden="true"
            className="text-setta-600/90 dark:text-setta-200/90"
            size={24}
          />
          <p className="text-sm font-semibold text-setta-900 dark:text-setta-100">
            {sectionName} moved to a window
          </p>
          <p className="text-xs text-setta-700/90 dark:text-setta-200/85">
            {explanatoryCopy}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={focusWindowTitle}
              className="inline-flex items-center rounded-md border border-setta-300 bg-white px-2.5 py-1 text-xs font-medium text-setta-800 shadow-sm transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100 dark:hover:bg-setta-850"
              data-setta-workspace-touch-target="compact"
              data-testid="section-window-placeholder-focus"
              onClick={() => onFocusWindow(windowId)}
              title={focusWindowTitle}
              {...getWorkspaceTooltipHandlers(host, {
                content: focusWindowTitle,
              })}
            >
              Focus window
            </button>
            {layoutEditable ? (
              <button
                type="button"
                aria-label={showInCanvasTitle}
                className="inline-flex items-center rounded-md border border-setta-300 bg-setta-50 px-2.5 py-1 text-xs font-medium text-setta-800 shadow-sm transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100 dark:hover:bg-setta-850"
                data-setta-workspace-touch-target="compact"
                data-testid="section-window-placeholder-restore"
                onClick={() => onShowInCanvas(windowId)}
                title={showInCanvasTitle}
                {...getWorkspaceTooltipHandlers(host, {
                  content: showInCanvasTitle,
                })}
              >
                Show in canvas
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
