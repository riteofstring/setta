import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRef } from "react";

const sectionMinHeight = 40;
const sectionMaxHeight = 520;

export const defaultSidebarSections = {
  chats: { height: 70, open: true, resized: false },
  notes: { height: 70, open: true, resized: false },
  projects: { height: 280, open: true, resized: false },
  rules: { height: 86, open: true, resized: false },
  shortcuts: { height: 146, open: true, resized: false },
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

  return (
    <section className="group/section min-w-0" data-testid={testId}>
      <div className="flex h-6 items-center justify-between gap-1 px-2">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center text-left text-xs font-medium text-zinc-500 hover:text-zinc-200"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {open ? (
        <div className="relative min-h-0" ref={bodyRef} style={sectionBodyStyle(height, resized)}>
          <div className={resized ? "h-full min-h-0 overflow-y-auto pb-1" : "pb-1"}>{children}</div>
          <SectionResizeHandle
            bodyRef={bodyRef}
            height={height}
            label={`Resize ${title}`}
            onHeightChange={onHeightChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function sectionBodyStyle(height: number, resized: boolean): CSSProperties | undefined {
  if (!resized) {
    return undefined;
  }
  return { height };
}

function SectionResizeHandle({
  bodyRef,
  height,
  label,
  onHeightChange,
}: {
  bodyRef: { current: HTMLDivElement | null };
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
