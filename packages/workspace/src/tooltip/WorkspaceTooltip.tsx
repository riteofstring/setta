import { Resizable } from "re-resizable";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import { getElementTextDirection, type WorkspaceTextDirection } from "../styles/textDirection";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";

// Main's reusable quick-info lifecycle: hold Q to reveal the staged pages, use the auxiliary
// Q chords to navigate/copy/freeze, and keep a frozen box interactive until Escape closes it.
// Main's product-specific plaintext/markdown section conversion stays in the application.
const INITIAL_TOOLTIP_WIDTH_PX = 256;
const MOUSE_OFFSET_PX = 10;
const VIEWPORT_CLAMP_MARGIN_PX = 8;
const COPIED_INDICATOR_DURATION_MS = 2000;
const TOOLTIP_SURFACE_SELECTOR = '[data-setta-workspace-tooltip-surface="true"]';

type WorkspaceTooltipTone = "default" | "error" | "warning" | "info";

type WorkspaceTooltipAnchor = {
  x: number;
  y: number;
};

export type WorkspaceTooltipPage = (
  { content: string; title?: string } | { content?: string; title: string }
) & {
  secondaryContent?: string;
  tone?: WorkspaceTooltipTone;
};

export type WorkspaceTooltipState = {
  anchor: WorkspaceTooltipAnchor | null;
  copied: boolean;
  direction: WorkspaceTextDirection;
  isEnabled: boolean;
  isFrozen: boolean;
  pageIndex: number;
  pages: ReadonlyArray<WorkspaceTooltipPage>;
};

export const useWorkspaceTooltip = createWithEqualityFn(
  withResetFn<WorkspaceTooltipState>(() => ({
    anchor: null,
    copied: false,
    direction: "ltr",
    isEnabled: false,
    isFrozen: false,
    pageIndex: 0,
    pages: [],
  })),
);

let focusBeforeFreeze: HTMLElement | null = null;

type WorkspaceTooltipHandlerOptions = WorkspaceTooltipPage & {
  stageOnFocus?: boolean;
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
  ...additionalPages: Array<WorkspaceTooltipPage>
): WorkspaceTooltipMouseHandlers & WorkspaceTooltipFocusHandlers;
export function getWorkspaceTooltipHandlers(
  options: WorkspaceTooltipHandlerOptions & { stageOnFocus?: false },
  ...additionalPages: Array<WorkspaceTooltipPage>
): WorkspaceTooltipMouseHandlers;
export function getWorkspaceTooltipHandlers(
  options: WorkspaceTooltipHandlerOptions,
  ...additionalPages: Array<WorkspaceTooltipPage>
): WorkspaceTooltipMouseHandlers | (WorkspaceTooltipMouseHandlers & WorkspaceTooltipFocusHandlers) {
  const { stageOnFocus = false, ...firstPage } = options;
  const pages = [firstPage as WorkspaceTooltipPage, ...additionalPages];

  function stagePages(currentTarget: HTMLElement, anchor: WorkspaceTooltipAnchor | null) {
    if (useWorkspaceTooltip.getState().isFrozen) {
      return;
    }
    useWorkspaceTooltip.setState({
      anchor,
      copied: false,
      direction: getElementTextDirection(currentTarget),
      pageIndex: 0,
      pages,
    });
  }

  function clearPages() {
    if (useWorkspaceTooltip.getState().isFrozen) {
      return;
    }
    useWorkspaceTooltip.setState({
      anchor: null,
      copied: false,
      pageIndex: 0,
      pages: [],
    });
  }

  function onMouseEnter(event: { currentTarget: HTMLElement }) {
    stagePages(event.currentTarget, null);
  }

  function onMouseLeave() {
    clearPages();
  }

  function onFocus(event: { currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    stagePages(event.currentTarget, { x: rect.right + MOUSE_OFFSET_PX, y: rect.top });
  }

  function onBlur(event: { currentTarget: HTMLElement; relatedTarget?: EventTarget | null }) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    clearPages();
  }

  const mouseHandlers = { onMouseEnter, onMouseLeave };
  return stageOnFocus ? { ...mouseHandlers, onBlur, onFocus } : mouseHandlers;
}

export function enableWorkspaceTooltip() {
  useWorkspaceTooltip.setState({ isEnabled: true });
}

export function disableWorkspaceTooltip() {
  if (useWorkspaceTooltip.getState().isFrozen) {
    return;
  }
  useWorkspaceTooltip.setState({ copied: false, isEnabled: false, pageIndex: 0 });
}

export function freezeWorkspaceTooltip(): boolean {
  const state = useWorkspaceTooltip.getState();
  if (!state.isEnabled || state.pages.length === 0) {
    return false;
  }
  if (state.isFrozen) {
    return true;
  }
  focusBeforeFreeze = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useWorkspaceTooltip.setState({ isFrozen: true });
  return true;
}

export function closeFrozenWorkspaceTooltip(): boolean {
  if (!useWorkspaceTooltip.getState().isFrozen) {
    return false;
  }
  const surface = document.querySelector<HTMLElement>(TOOLTIP_SURFACE_SELECTOR);
  const shouldRestoreFocus = surface?.contains(document.activeElement) ?? false;
  const focusTarget = focusBeforeFreeze;
  focusBeforeFreeze = null;
  useWorkspaceTooltip.setState({
    anchor: null,
    copied: false,
    isEnabled: false,
    isFrozen: false,
    pageIndex: 0,
    pages: [],
  });
  if (shouldRestoreFocus && focusTarget?.isConnected) {
    queueMicrotask(() => focusTarget.focus({ preventScroll: true }));
  }
  return true;
}

function moveWorkspaceTooltipPage(delta: number): boolean {
  const state = useWorkspaceTooltip.getState();
  if (!state.isEnabled || state.pages.length === 0) {
    return false;
  }
  const pageIndex = (state.pageIndex + delta + state.pages.length) % state.pages.length;
  useWorkspaceTooltip.setState({ copied: false, pageIndex });
  return true;
}

export function incrementWorkspaceTooltipPage(): boolean {
  return moveWorkspaceTooltipPage(1);
}

export function decrementWorkspaceTooltipPage(): boolean {
  return moveWorkspaceTooltipPage(-1);
}

export function copyWorkspaceTooltipPage(): boolean {
  const state = useWorkspaceTooltip.getState();
  const page = state.pages[state.pageIndex];
  const content = page?.content ?? page?.title;
  if (!state.isEnabled || !content || !navigator.clipboard) {
    return false;
  }
  useWorkspaceTooltip.setState({ copied: true });
  void navigator.clipboard.writeText(content).then(undefined, () => {
    useWorkspaceTooltip.setState({ copied: false });
  });
  return true;
}

export function getIsFrozenWorkspaceTooltipFocused(): boolean {
  const state = useWorkspaceTooltip.getState();
  if (!state.isEnabled || !state.isFrozen) {
    return false;
  }
  const surface = document.querySelector<HTMLElement>(TOOLTIP_SURFACE_SELECTOR);
  return surface?.contains(document.activeElement) ?? false;
}

// The pointer is tracked globally so pressing Q can reveal a staged tooltip at the current
// cursor before the pointer moves again.
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
  const { anchor, copied, direction, isEnabled, isFrozen, pageIndex, pages } =
    useWorkspaceTooltip();
  const page = pages[pageIndex];
  const [boxElement, setBoxElement] = useState<HTMLDivElement | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const [tooltipWidth, setTooltipWidth] = useState(INITIAL_TOOLTIP_WIDTH_PX);
  useTrackMouseLocation();
  useCopiedIndicator(copied);
  useFrozenTooltipFocus(boxElement, isFrozen);
  useTooltipFollower({ anchor, boxElement, isEnabled, isFrozen, positionRef });
  const handleDragPointerDown = useFrozenTooltipDrag({
    boxElement,
    isFrozen,
    positionRef,
  });

  if (!isEnabled || !page) {
    return null;
  }

  return createPortal(
    <TooltipPortal
      boxRef={setBoxElement}
      copied={copied}
      direction={direction}
      handleDragPointerDown={handleDragPointerDown}
      isFrozen={isFrozen}
      page={page}
      pageCount={pages.length}
      pageIndex={pageIndex}
      position={positionRef.current}
      setTooltipWidth={setTooltipWidth}
      tooltipWidth={tooltipWidth}
      workspaceScopeClassName={workspaceScopeClassName}
    />,
    document.body,
  );
}

function useCopiedIndicator(copied: boolean) {
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => {
      useWorkspaceTooltip.setState({ copied: false });
    }, COPIED_INDICATOR_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);
}

function useFrozenTooltipFocus(boxElement: HTMLDivElement | null, isFrozen: boolean) {
  useEffect(() => {
    if (isFrozen) {
      boxElement?.focus({ preventScroll: true });
    }
  }, [boxElement, isFrozen]);
}

type PositionRef = React.RefObject<{ x: number; y: number }>;

function setClampedTooltipPosition(
  box: HTMLDivElement,
  positionRef: PositionRef,
  x: number,
  y: number,
) {
  const rect = box.getBoundingClientRect();
  const maxX = Math.max(
    VIEWPORT_CLAMP_MARGIN_PX,
    window.innerWidth - rect.width - VIEWPORT_CLAMP_MARGIN_PX,
  );
  const maxY = Math.max(
    VIEWPORT_CLAMP_MARGIN_PX,
    window.innerHeight - rect.height - VIEWPORT_CLAMP_MARGIN_PX,
  );
  const position = {
    x: Math.min(Math.max(x, VIEWPORT_CLAMP_MARGIN_PX), maxX),
    y: Math.min(Math.max(y, VIEWPORT_CLAMP_MARGIN_PX), maxY),
  };
  positionRef.current = position;
  box.style.transform = `translate(${position.x}px, ${position.y}px)`;
}

function useTooltipFollower({
  anchor,
  boxElement,
  isEnabled,
  isFrozen,
  positionRef,
}: {
  anchor: WorkspaceTooltipAnchor | null;
  boxElement: HTMLDivElement | null;
  isEnabled: boolean;
  isFrozen: boolean;
  positionRef: PositionRef;
}) {
  useEffect(() => {
    if (!isEnabled || isFrozen || !boxElement) {
      return;
    }
    const activeBox = boxElement;
    if (anchor) {
      setClampedTooltipPosition(activeBox, positionRef, anchor.x, anchor.y);
      return;
    }
    setClampedTooltipPosition(
      activeBox,
      positionRef,
      mouseLocation.x + MOUSE_OFFSET_PX,
      mouseLocation.y + MOUSE_OFFSET_PX,
    );
    function handleMouseMove(event: MouseEvent) {
      setClampedTooltipPosition(
        activeBox,
        positionRef,
        event.clientX + MOUSE_OFFSET_PX,
        event.clientY + MOUSE_OFFSET_PX,
      );
    }
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [anchor, boxElement, isEnabled, isFrozen, positionRef]);
}

function useFrozenTooltipDrag({
  boxElement,
  isFrozen,
  positionRef,
}: {
  boxElement: HTMLDivElement | null;
  isFrozen: boolean;
  positionRef: PositionRef;
}) {
  const [activeCleanup, setActiveCleanup] = useState<(() => void) | null>(null);
  useEffect(() => activeCleanup ?? undefined, [activeCleanup]);
  return (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isFrozen || !boxElement) {
      return;
    }
    const activeBox = boxElement;
    event.preventDefault();
    const rect = activeBox.getBoundingClientRect();
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    activeCleanup?.();
    function handlePointerMove(pointerEvent: PointerEvent) {
      setClampedTooltipPosition(
        activeBox,
        positionRef,
        pointerEvent.clientX - offset.x,
        pointerEvent.clientY - offset.y,
      );
    }
    function cleanup() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    }
    function finish() {
      cleanup();
      setActiveCleanup(null);
    }
    setActiveCleanup(() => cleanup);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
}

type TooltipPortalProps = {
  boxRef: (element: HTMLDivElement | null) => void;
  copied: boolean;
  direction: WorkspaceTextDirection;
  handleDragPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isFrozen: boolean;
  page: WorkspaceTooltipPage;
  pageCount: number;
  pageIndex: number;
  position: { x: number; y: number };
  setTooltipWidth: React.Dispatch<React.SetStateAction<number>>;
  tooltipWidth: number;
  workspaceScopeClassName: string;
};

function TooltipPortal({
  boxRef,
  copied,
  direction,
  handleDragPointerDown,
  isFrozen,
  page,
  pageCount,
  pageIndex,
  position,
  setTooltipWidth,
  tooltipWidth,
  workspaceScopeClassName,
}: TooltipPortalProps) {
  const surface = (
    <TooltipSurface
      copied={copied}
      handleDragPointerDown={handleDragPointerDown}
      isFrozen={isFrozen}
      page={page}
      pageCount={pageCount}
      pageIndex={pageIndex}
    />
  );
  return (
    <div
      aria-label={isFrozen ? (page.title ?? "Quick info") : undefined}
      aria-modal={isFrozen ? "false" : undefined}
      className={`${workspaceScopeClassName} fixed left-0 top-0 z-[80] rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600`}
      data-setta-workspace-tooltip-portal="true"
      data-setta-workspace-tooltip-surface="true"
      dir={direction}
      ref={boxRef}
      role={isFrozen ? "dialog" : "tooltip"}
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, width: tooltipWidth }}
      tabIndex={isFrozen ? 0 : -1}
    >
      {isFrozen ? (
        <Resizable
          enable={{
            bottom: false,
            bottomLeft: false,
            bottomRight: false,
            left: false,
            right: true,
            top: false,
            topLeft: false,
            topRight: false,
          }}
          minWidth={INITIAL_TOOLTIP_WIDTH_PX}
          onResizeStop={(_event, _direction, _element, delta) => {
            setTooltipWidth((width) => Math.max(INITIAL_TOOLTIP_WIDTH_PX, width + delta.width));
          }}
          size={{ height: "auto", width: tooltipWidth }}
        >
          {surface}
        </Resizable>
      ) : (
        surface
      )}
    </div>
  );
}

function TooltipSurface({
  copied,
  handleDragPointerDown,
  isFrozen,
  page,
  pageCount,
  pageIndex,
}: {
  copied: boolean;
  handleDragPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isFrozen: boolean;
  page: WorkspaceTooltipPage;
  pageCount: number;
  pageIndex: number;
}) {
  const tone = page.tone ?? "default";
  return (
    <div
      className={`relative flex max-h-96 min-h-32 min-w-64 flex-col rounded-2xl border p-4 shadow-lg ${getTooltipToneClassName(tone)}`}
      data-setta-workspace-tooltip-tone={tone}
    >
      {isFrozen ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-8 cursor-move rounded-t-2xl"
          data-setta-workspace-tooltip-drag-handle="true"
          onPointerDown={handleDragPointerDown}
        />
      ) : null}
      {isFrozen ? <TooltipCopyButton copied={copied} /> : null}
      {page.title ? (
        <h3 className="break-words pb-1 pe-4 text-xs font-black uppercase text-setta-500 dark:text-setta-600">
          {page.title}
        </h3>
      ) : null}
      {page.content ? (
        <article
          className={`flex-1 overflow-y-auto whitespace-pre-line break-words pe-4 text-sm ${getTooltipContentToneClassName(tone)}`}
        >
          {page.content}
        </article>
      ) : null}
      {page.secondaryContent ? (
        <article
          className={`mt-4 whitespace-pre-line break-words border-t pt-3 pe-4 text-sm ${getTooltipSecondaryContentToneClassName(tone)}`}
        >
          {page.secondaryContent}
        </article>
      ) : null}
      <TooltipPageIndicator pageCount={pageCount} pageIndex={pageIndex} />
      {page.content ? <TooltipShortcutFooter isFrozen={isFrozen} pageCount={pageCount} /> : null}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}

function TooltipCopyButton({ copied }: { copied: boolean }) {
  return (
    <button
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className="absolute right-2 top-2 z-10 cursor-pointer rounded-lg p-1.5 text-setta-500 hover:bg-setta-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-setta-400 dark:hover:bg-setta-800"
      onClick={(event) => {
        event.stopPropagation();
        copyWorkspaceTooltipPage();
      }}
      type="button"
    >
      {copied ? (
        <HiCheck aria-hidden="true" className="h-4 w-4" />
      ) : (
        <HiOutlineDuplicate aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}

function TooltipPageIndicator({ pageCount, pageIndex }: { pageCount: number; pageIndex: number }) {
  if (pageCount <= 1) {
    return null;
  }
  return (
    <>
      <div aria-hidden="true" className="mt-4 flex items-center justify-center gap-2">
        {Array.from({ length: pageCount }, (_, index) => (
          <span
            className={`h-2 w-2 rounded-full ${index === pageIndex ? "bg-blue-500" : "bg-setta-300 dark:bg-setta-600"}`}
            key={index}
          />
        ))}
      </div>
      <span className="sr-only">{`Page ${pageIndex + 1} of ${pageCount}`}</span>
    </>
  );
}

function TooltipShortcutFooter({ isFrozen, pageCount }: { isFrozen: boolean; pageCount: number }) {
  const shortcutClassName = "font-black tracking-tighter";
  return (
    <p className="mt-4 border-t border-solid border-setta-100 pt-1 text-[10px] text-setta-500 dark:border-setta-700 dark:text-setta-600">
      {pageCount > 1 ? (
        <>
          <kbd className={shortcutClassName}>{isFrozen ? "← / →" : "Q + ← / →"}</kbd> pages,{" "}
        </>
      ) : null}
      <kbd className={shortcutClassName}>{isFrozen ? "C" : "Q + C"}</kbd> copy,{" "}
      {isFrozen ? (
        <>
          <kbd className={shortcutClassName}>Esc</kbd> close
        </>
      ) : (
        <>
          <kbd className={shortcutClassName}>Q + F</kbd> freeze
        </>
      )}
    </p>
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
