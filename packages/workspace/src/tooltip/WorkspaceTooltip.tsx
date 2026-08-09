import { useEffect, useRef } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import { WORKSPACE_SCOPE_CLASS_NAME } from "../styles/workspaceScope";

// The seam-8 tooltip singleton: the reference's `FloatingBox` trimmed to its mouse-following
// form. The box is enabled while the tooltip key is held (the reference's `showTooltipShortcut`,
// shipped default "Q") and shows the single content string staged by the hovered control. Frozen
// mode, the copy button, multi-page content, the shortcut-hint footer, and the resizable width
// left with the app shortcut engine and convert-to-section features that drive them; the width
// stays at the reference's initial `tooltipWidth` preference.
const TOOLTIP_WIDTH_PX = 256;
const MOUSE_OFFSET_PX = 10;
const VIEWPORT_CLAMP_MARGIN_PX = 8;

export type WorkspaceTooltipState = {
  isEnabled: boolean;
  content: string | null;
};

export const useWorkspaceTooltip = createWithEqualityFn(
  withResetFn<WorkspaceTooltipState>(() => ({
    isEnabled: false,
    content: null,
  })),
);

export function getWorkspaceTooltipHandlers({ content }: { content: string }) {
  function onMouseEnter() {
    useWorkspaceTooltip.setState({ content });
  }

  function onMouseLeave() {
    useWorkspaceTooltip.setState({ content: null });
  }

  return { onMouseEnter, onMouseLeave };
}

export function enableWorkspaceTooltip() {
  useWorkspaceTooltip.setState({ isEnabled: true });
}

export function disableWorkspaceTooltip() {
  useWorkspaceTooltip.setState({ isEnabled: false });
}

// The reference tracks the pointer globally (`mouseLocation`) so the box can appear at the
// cursor the moment the tooltip key goes down, before any further movement.
let mouseLocation = { x: 0, y: 0 };

function useTrackMouseLocation() {
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      mouseLocation = { x: event.clientX, y: event.clientY };
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);
}

export function WorkspaceTooltip() {
  const isEnabled = useWorkspaceTooltip((state) => state.isEnabled);
  const content = useWorkspaceTooltip((state) => state.content);
  const boxRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  useTrackMouseLocation();

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    function updateBoxPosition(x: number, y: number) {
      const box = boxRef.current;
      if (!box) {
        return;
      }
      const rect = box.getBoundingClientRect();
      if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - VIEWPORT_CLAMP_MARGIN_PX;
      }
      if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - VIEWPORT_CLAMP_MARGIN_PX;
      }
      positionRef.current = { x, y };
      box.style.transform = `translate(${x}px, ${y}px)`;
    }

    updateBoxPosition(mouseLocation.x + MOUSE_OFFSET_PX, mouseLocation.y + MOUSE_OFFSET_PX);

    function handleMouseMove(event: MouseEvent) {
      updateBoxPosition(event.clientX + MOUSE_OFFSET_PX, event.clientY + MOUSE_OFFSET_PX);
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isEnabled]);

  if (!isEnabled || content === null) {
    return null;
  }

  return (
    <div
      className={`${WORKSPACE_SCOPE_CLASS_NAME} absolute left-0 top-0 z-[80]`}
      ref={boxRef}
      style={{
        transform: `translate(${positionRef.current.x}px, ${positionRef.current.y}px)`,
        width: `${TOOLTIP_WIDTH_PX}px`,
      }}
    >
      <div className="flex max-h-96 min-h-32 min-w-64 flex-col rounded-2xl border border-setta-200 bg-white p-4 shadow-lg dark:border-setta-700 dark:bg-setta-950">
        <article className="flex-1 overflow-y-auto whitespace-pre-line break-words pr-4 text-sm text-setta-700 dark:text-setta-300">
          {content}
        </article>
      </div>
    </div>
  );
}
