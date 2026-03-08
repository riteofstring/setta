import { RiExternalLinkLine } from "react-icons/ri";
import {
  bootProjectChatWindowToCanvasSection,
  focusProjectChatWindow,
} from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";

type SectionWindowPlaceholderProps = {
  instanceId: string;
  sectionId: string;
  dataTestId?: string;
};

export function SectionWindowPlaceholder({
  instanceId,
  sectionId,
  dataTestId = "section-window-placeholder",
}: SectionWindowPlaceholderProps) {
  const sectionName = useProjectState((state) => {
    const section = state.sections[sectionId];
    if (!section) {
      return "Section";
    }
    const displayName = section.displayName?.trim();
    return displayName && displayName.length > 0 ? displayName : section.name;
  });

  return (
    <div
      className="section-main-full-w flex min-h-0 flex-1 flex-col"
      data-testid={dataTestId}
      data-chat-window-instance-id={instanceId}
      data-chat-window-section-id={sectionId}
    >
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed border-setta-300/80 bg-setta-100/45 dark:border-setta-600/80 dark:bg-setta-900/35">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-setta-300/20 via-setta-200/20 to-transparent dark:from-setta-600/15 dark:via-setta-700/10 dark:to-transparent" />
        <div className="pointer-events-auto relative flex max-w-[24rem] flex-col items-center gap-2 rounded-xl border border-setta-300/70 bg-white/80 px-5 py-4 text-center shadow-sm dark:border-setta-600/70 dark:bg-setta-925/80">
          <RiExternalLinkLine
            size={24}
            className="text-setta-600/90 dark:text-setta-200/90"
          />
          <p className="text-sm font-semibold text-setta-900 dark:text-setta-100">
            {sectionName} moved to a window
          </p>
          <p className="text-xs text-setta-700/90 dark:text-setta-200/85">
            Focus the external window or return this section to the canvas.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-setta-300 bg-white px-2.5 py-1 text-xs font-medium text-setta-800 shadow-sm transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100 dark:hover:bg-setta-850"
              onClick={() => {
                focusProjectChatWindow(instanceId);
              }}
              data-testid="section-window-placeholder-focus"
            >
              Focus window
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-setta-300 bg-setta-50 px-2.5 py-1 text-xs font-medium text-setta-800 shadow-sm transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100 dark:hover:bg-setta-850"
              onClick={() => {
                void bootProjectChatWindowToCanvasSection(instanceId);
              }}
              data-testid="section-window-placeholder-restore"
            >
              Show in canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
