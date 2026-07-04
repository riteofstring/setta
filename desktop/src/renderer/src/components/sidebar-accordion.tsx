import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

import { cn } from "../lib/utils";

const sectionMinHeight = 40;
const sectionMaxHeight = 520;
const noScrollAnchoringStyle = { overflowAnchor: "none" } satisfies CSSProperties;

export const defaultSidebarSections = {
  projects: { height: 280, open: true, resized: false },
  runtime: { height: 132, open: true, resized: false },
  shortcuts: { height: 42, open: true, resized: false },
} satisfies Record<string, SidebarSectionState>;

export type SidebarSectionId = keyof typeof defaultSidebarSections;

export interface SidebarSectionState {
  height: number;
  open: boolean;
  resized: boolean;
}

export function SidebarAccordionSection({
  action,
  children,
  height,
  onHeightChange,
  onOpenChange,
  open,
  resized,
  testId,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  height: number;
  onHeightChange: (height: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  resized: boolean;
  testId: string;
  title: string;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !resized) {
      return;
    }
    const nextHeight = constrainSectionHeight(height, measuredContentHeight(contentRef.current));
    if (nextHeight !== height) {
      onHeightChange(nextHeight);
    }
  }, [children, height, onHeightChange, open, resized]);

  return (
    <section className="group/section min-w-0" data-testid={testId}>
      <div className="flex h-6 items-center justify-between gap-1 pl-2 pr-0.5">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          <span className="truncate">{title}</span>
        </button>
        {action ? (
          <div className="opacity-0 transition-opacity duration-75 ease-out group-hover/section:opacity-100 group-focus-within/section:opacity-100">
            {action}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden={!open}
        className={cn(
          "relative grid min-h-0 overflow-hidden transition-[grid-template-rows,height,opacity] duration-125 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        data-state={open ? "open" : "closed"}
        ref={bodyRef}
        style={sectionBodyStyle({ height, open, resized })}
      >
        <div
          className={
            resized && open
              ? "h-full min-h-0 overflow-y-auto overscroll-contain"
              : "min-h-0 overflow-hidden"
          }
          style={noScrollAnchoringStyle}
        >
          <div className="pb-4" ref={contentRef}>
            {children}
          </div>
        </div>
        {open ? (
          <SectionResizeHandle
            bodyRef={bodyRef}
            contentRef={contentRef}
            height={height}
            label={`Resize ${title}`}
            onHeightChange={onHeightChange}
          />
        ) : null}
      </div>
    </section>
  );
}

function sectionBodyStyle({
  height,
  open,
  resized,
}: {
  height: number;
  open: boolean;
  resized: boolean;
}): CSSProperties | undefined {
  if (!resized && open) {
    return undefined;
  }
  return { height: open ? height : 0 };
}

function SectionResizeHandle({
  bodyRef,
  contentRef,
  height,
  label,
  onHeightChange,
}: {
  bodyRef: { current: HTMLDivElement | null };
  contentRef: { current: HTMLDivElement | null };
  height: number;
  label: string;
  onHeightChange: (height: number) => void;
}) {
  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bodyRef.current?.getBoundingClientRect().height ?? height;

    function resize(pointerEvent: PointerEvent) {
      const delta = pointerEvent.clientY - startY;
      onHeightChange(
        constrainSectionHeight(startHeight + delta, measuredContentHeight(contentRef.current)),
      );
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  }

  return (
    <div
      aria-label={label}
      aria-orientation="horizontal"
      className="absolute inset-x-2 bottom-0 h-4 cursor-row-resize opacity-0 transition-opacity group-hover/section:opacity-100"
      onPointerDown={beginResize}
      role="separator"
    >
      <div className="mx-auto mt-2 h-px w-10 rounded-full bg-border/80" />
    </div>
  );
}

export function constrainSectionHeight(value: number, contentHeight: number) {
  const max = Math.max(1, Math.min(Math.ceil(contentHeight), sectionMaxHeight));
  return clamp(value, Math.min(sectionMinHeight, max), max);
}

function measuredContentHeight(node: HTMLDivElement | null) {
  return node ? node.getBoundingClientRect().height : sectionMaxHeight;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
