import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { cn } from "../lib/utils";

const sectionMinHeight = 40;
const sectionMaxHeight = 520;

export const defaultSidebarSections = {
  chats: { height: 70, open: true },
  memories: { height: 58, open: true },
  notes: { height: 70, open: true },
  projects: { height: 280, open: true },
  rules: { height: 86, open: true },
} satisfies Record<string, SidebarSectionState>;

export type SidebarSectionId = keyof typeof defaultSidebarSections;

export interface SidebarSectionState {
  height: number;
  open: boolean;
}

export function SidebarAccordionSection({
  action,
  children,
  height,
  onHeightChange,
  onOpenChange,
  open,
  testId,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  height: number;
  onHeightChange: (height: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  testId: string;
  title: string;
}) {
  return (
    <section className="group/section min-w-0" data-testid={testId}>
      <div className="flex h-6 items-center justify-between gap-1 px-2">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-zinc-500 hover:text-zinc-200"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              open ? "bg-zinc-500" : "bg-zinc-700",
            )}
          />
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {open ? (
        <div className="relative min-h-0" style={sectionBodyStyle(height)}>
          <div className="h-full min-h-0 overflow-y-auto pb-1">{children}</div>
          <SectionResizeHandle
            height={height}
            label={`Resize ${title}`}
            onHeightChange={onHeightChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function sectionBodyStyle(height: number): CSSProperties {
  return { height };
}

function SectionResizeHandle({
  height,
  label,
  onHeightChange,
}: {
  height: number;
  label: string;
  onHeightChange: (height: number) => void;
}) {
  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    function resize(pointerEvent: PointerEvent) {
      const delta = pointerEvent.clientY - startY;
      onHeightChange(clamp(startHeight + delta, sectionMinHeight, sectionMaxHeight));
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
      className="absolute inset-x-2 bottom-0 h-2 cursor-row-resize opacity-0 transition-opacity group-hover/section:opacity-100"
      onPointerDown={beginResize}
      role="separator"
    >
      <div className="mx-auto mt-[3px] h-px w-10 rounded-full bg-zinc-600/80" />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
