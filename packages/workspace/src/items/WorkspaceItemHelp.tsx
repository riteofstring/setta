import { useId, useRef, useState } from "react";
import { FiHelpCircle } from "react-icons/fi";
import { ControlPopover } from "../controls/popover/ControlPopover";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../interaction";
import { getElementTextDirection, type WorkspaceTextDirection } from "../styles/textDirection";

// Frozen main stores parameter descriptions and edits them in QuickInfoConfig, but it does not
// expose a reusable in-row description surface. Milestone B3 authorizes this package-owned help
// disclosure: its portal escapes section/group overflow, while pointer opening deliberately leaves
// focus in the active editor. Keyboard users reach the native button in row order, and its hidden
// description makes the same help available directly to screen readers.

export function WorkspaceItemHelp({
  helpText,
  isGroup,
  itemLabel,
}: {
  helpText: string;
  isGroup: boolean;
  itemLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<WorkspaceTextDirection>("ltr");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const descriptionId = `setta-item-help-${useId().replaceAll(":", "")}`;
  const resolvedLabel = itemLabel.trim() || "unnamed parameter";

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen && triggerRef.current) {
      setDirection(getElementTextDirection(triggerRef.current));
    }
    setOpen(nextOpen);
  }

  return (
    <>
      <ControlPopover
        contentClasses="z-[90] box-border max-h-[calc(100vh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-setta-200 bg-white px-3 py-2 text-sm leading-5 text-setta-700 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-300"
        contentProps={{
          align: "start",
          "aria-label": `${resolvedLabel} help`,
          collisionPadding: 8,
          onCloseAutoFocus: (event) => event.preventDefault(),
          onOpenAutoFocus: (event) => event.preventDefault(),
          side: "top",
          sideOffset: 6,
        }}
        direction={direction}
        onOpenChange={handleOpenChange}
        open={open}
        trigger={
          <button
            aria-describedby={descriptionId}
            aria-label={`Show help for ${resolvedLabel}`}
            className={`${isGroup ? "section-key-value" : "section-key"} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} relative z-10 me-0.5 grid h-6 w-6 self-center justify-self-end place-items-center rounded-full border-0 bg-transparent p-0 text-setta-400 hover:bg-setta-200/60 hover:text-setta-700 focus-visible:outline-2 focus-visible:outline-offset-1 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-200`}
            data-setta-workspace-item-help-trigger="true"
            data-setta-workspace-touch-target="compact"
            data-tab-native="true"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            ref={triggerRef}
            type="button"
          >
            <FiHelpCircle aria-hidden={true} focusable="false" />
          </button>
        }
      >
        {helpText}
      </ControlPopover>
      <span className="sr-only" id={descriptionId}>
        {helpText}
      </span>
    </>
  );
}
