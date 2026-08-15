import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import { getElementTextDirection, type WorkspaceTextDirection } from "../styles/textDirection";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";

// The seam-8 tooltip singleton: the reference's `FloatingBox` trimmed to its mouse-following
// form. The box is enabled while the tooltip key is held (the reference's `showTooltipShortcut`,
// shipped default "Q") and shows the quick-info content staged by the hovered control. An optional
// supplemental block keeps a parameter's help distinct from its diagnostic without importing the
// reference's multi-page state. Frozen mode, the copy button, page shortcuts, the shortcut-hint
// footer, and the resizable width left with the app shortcut engine and convert-to-section features
// that drive them; the width stays at the reference's initial `tooltipWidth` preference.
const TOOLTIP_WIDTH_PX = 256;
const MOUSE_OFFSET_PX = 10;
const VIEWPORT_CLAMP_MARGIN_PX = 8;

export type WorkspaceTooltipTone = "default" | "error" | "warning" | "info";

type WorkspaceTooltipAnchor = {
  x: number;
  y: number;
};

export type WorkspaceTooltipState = {
  isEnabled: boolean;
  content: string | null;
  direction: WorkspaceTextDirection;
  title: string | null;
  tone: WorkspaceTooltipTone;
  anchor: WorkspaceTooltipAnchor | null;
  secondaryContent: string | null;
};

export const useWorkspaceTooltip = createWithEqualityFn(
  withResetFn<WorkspaceTooltipState>(() => ({
    isEnabled: false,
    content: null,
    direction: "ltr",
    title: null,
    tone: "default",
    anchor: null,
    secondaryContent: null,
  })),
);

type WorkspaceTooltipHandlerOptions = {
  content: string;
  secondaryContent?: string;
  title?: string;
  tone?: WorkspaceTooltipTone;
};

type WorkspaceTooltipMouseHandlers = {
  onMouseEnter: (event: { currentTarget: HTMLElement }) => void;
  onMouseLeave: () => void;
};

type WorkspaceTooltipFocusHandlers = {
  onBlur: (event: { currentTarget: HTMLElement; relatedTarget?: EventTarget | null }) => void;
  onFocus: (event: { currentTarget: HTMLElement }) => void;
};

export function getWorkspaceTooltipHandlers(
  options: WorkspaceTooltipHandlerOptions & { stageOnFocus: true },
): WorkspaceTooltipMouseHandlers & WorkspaceTooltipFocusHandlers;
export function getWorkspaceTooltipHandlers(
  options: WorkspaceTooltipHandlerOptions & { stageOnFocus?: false },
): WorkspaceTooltipMouseHandlers;
export function getWorkspaceTooltipHandlers({
  content,
  secondaryContent,
  stageOnFocus = false,
  title,
  tone = "default",
}: WorkspaceTooltipHandlerOptions & { stageOnFocus?: boolean }):
  WorkspaceTooltipMouseHandlers | (WorkspaceTooltipMouseHandlers & WorkspaceTooltipFocusHandlers) {
  function onMouseEnter(event: { currentTarget: HTMLElement }) {
    useWorkspaceTooltip.setState({
      anchor: null,
      content,
      direction: getElementTextDirection(event.currentTarget),
      secondaryContent: secondaryContent ?? null,
      title: title ?? null,
      tone,
    });
  }

  function onMouseLeave() {
    useWorkspaceTooltip.setState({
      anchor: null,
      content: null,
      secondaryContent: null,
      title: null,
      tone: "default",
    });
  }

  function onFocus(event: { currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    useWorkspaceTooltip.setState({
      anchor: { x: rect.right + MOUSE_OFFSET_PX, y: rect.top },
      content,
      direction: getElementTextDirection(event.currentTarget),
      secondaryContent: secondaryContent ?? null,
      title: title ?? null,
      tone,
    });
  }

  function onBlur(event: { currentTarget: HTMLElement; relatedTarget?: EventTarget | null }) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    useWorkspaceTooltip.setState({
      anchor: null,
      content: null,
      secondaryContent: null,
      title: null,
      tone: "default",
    });
  }

  const mouseHandlers = { onMouseEnter, onMouseLeave };
  return stageOnFocus ? { ...mouseHandlers, onBlur, onFocus } : mouseHandlers;
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
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const isEnabled = useWorkspaceTooltip((state) => state.isEnabled);
  const content = useWorkspaceTooltip((state) => state.content);
  const direction = useWorkspaceTooltip((state) => state.direction);
  const title = useWorkspaceTooltip((state) => state.title);
  const tone = useWorkspaceTooltip((state) => state.tone);
  const anchor = useWorkspaceTooltip((state) => state.anchor);
  const secondaryContent = useWorkspaceTooltip((state) => state.secondaryContent);
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

    if (anchor) {
      updateBoxPosition(anchor.x, anchor.y);
      return;
    }

    updateBoxPosition(mouseLocation.x + MOUSE_OFFSET_PX, mouseLocation.y + MOUSE_OFFSET_PX);

    function handleMouseMove(event: MouseEvent) {
      updateBoxPosition(event.clientX + MOUSE_OFFSET_PX, event.clientY + MOUSE_OFFSET_PX);
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [anchor, isEnabled]);

  if (!isEnabled || content === null) {
    return null;
  }

  return createPortal(
    <div
      className={`${workspaceScopeClassName} fixed left-0 top-0 z-[80]`}
      data-setta-workspace-tooltip-portal="true"
      dir={direction}
      ref={boxRef}
      style={{
        transform: `translate(${positionRef.current.x}px, ${positionRef.current.y}px)`,
        width: `${TOOLTIP_WIDTH_PX}px`,
      }}
    >
      <div
        className={`flex max-h-96 min-h-32 min-w-64 flex-col rounded-2xl border p-4 shadow-lg ${getTooltipToneClassName(tone)}`}
        data-setta-workspace-tooltip-tone={tone}
        role="tooltip"
      >
        {title ? (
          <h3 className="break-words pb-1 pe-4 text-xs font-black uppercase text-setta-500 dark:text-setta-600">
            {title}
          </h3>
        ) : null}
        <article
          className={`flex-1 overflow-y-auto whitespace-pre-line break-words pe-4 text-sm ${getTooltipContentToneClassName(tone)}`}
        >
          {content}
        </article>
        {secondaryContent ? (
          <article
            className={`mt-4 whitespace-pre-line break-words border-t pt-3 pe-4 text-sm ${getTooltipSecondaryContentToneClassName(tone)}`}
          >
            {secondaryContent}
          </article>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function getTooltipToneClassName(tone: WorkspaceTooltipTone): string {
  if (tone === "error") {
    return "border-red-300 bg-red-50/95 dark:border-red-900 dark:bg-[#120000]/95";
  }
  if (tone === "warning") {
    return "border-amber-300 bg-amber-50/95 dark:border-amber-900 dark:bg-amber-950/95";
  }
  if (tone === "info") {
    return "border-sky-300 bg-sky-50/95 dark:border-sky-900 dark:bg-sky-950/95";
  }
  return "border-setta-200 bg-white dark:border-setta-700 dark:bg-setta-950";
}

function getTooltipContentToneClassName(tone: WorkspaceTooltipTone): string {
  if (tone === "error") {
    return "font-mono text-red-700 dark:text-red-300";
  }
  if (tone === "warning") {
    return "text-amber-800 dark:text-amber-200";
  }
  if (tone === "info") {
    return "text-sky-800 dark:text-sky-200";
  }
  return "text-setta-700 dark:text-setta-300";
}

function getTooltipSecondaryContentToneClassName(tone: WorkspaceTooltipTone): string {
  if (tone === "error") {
    return "border-red-200 text-red-900 dark:border-red-950 dark:text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-200 text-amber-950 dark:border-amber-900 dark:text-amber-100";
  }
  if (tone === "info") {
    return "border-sky-200 text-sky-950 dark:border-sky-900 dark:text-sky-100";
  }
  return "border-setta-100 text-setta-700 dark:border-setta-700 dark:text-setta-300";
}
