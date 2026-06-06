import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useState } from "react";

import { cn } from "../lib/utils";

export function ResizablePane({
  children,
  label,
  maxWidth,
  minWidth,
  onWidthChange,
  width,
}: {
  children: ReactNode;
  label: string;
  maxWidth: number;
  minWidth: number;
  onWidthChange: (width: number) => void;
  width: number;
}) {
  const [resizing, setResizing] = useState(false);
  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const startX = event.clientX;
      const startWidth = width;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const resize = (moveEvent: globalThis.PointerEvent) => {
        onWidthChange(clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth));
      };
      const stopResize = () => {
        setResizing(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", resize);
      };

      event.preventDefault();
      setResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize, { once: true });
    },
    [maxWidth, minWidth, onWidthChange, width],
  );

  return (
    <div
      className={cn(
        "relative h-full min-h-0 shrink-0",
        !resizing && "transition-[width] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
      )}
      style={{ width }}
    >
      {children}
      <div
        aria-label={label}
        aria-orientation="vertical"
        className="absolute top-0 right-0 z-30 h-full w-2 translate-x-1 cursor-col-resize"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onWidthChange(clamp(width - 12, minWidth, maxWidth));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onWidthChange(clamp(width + 12, minWidth, maxWidth));
          }
        }}
        onPointerDown={startResize}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}

export function ResizableBottomPane({
  children,
  height,
  label,
  maximized,
  minHeight,
  onHeightChange,
}: {
  children: ReactNode;
  height: number;
  label: string;
  maximized: boolean;
  minHeight: number;
  onHeightChange: (height: number) => void;
}) {
  const [resizing, setResizing] = useState(false);
  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const startY = event.clientY;
      const startHeight = height;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const resize = (moveEvent: globalThis.PointerEvent) => {
        const nextHeight = startHeight + startY - moveEvent.clientY;
        onHeightChange(clamp(nextHeight, minHeight, bottomPaneMaxHeight(minHeight)));
      };
      const stopResize = () => {
        setResizing(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", resize);
      };

      event.preventDefault();
      setResizing(true);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize, { once: true });
    },
    [height, minHeight, onHeightChange],
  );

  return (
    <div
      className={cn(
        "relative min-h-0 w-full",
        maximized ? "h-full" : "shrink-0",
        !resizing &&
          !maximized &&
          "transition-[height] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
      )}
      style={maximized ? undefined : { height }}
    >
      {children}
      {!maximized ? (
        <div
          aria-label={label}
          aria-orientation="horizontal"
          className="absolute inset-x-0 top-0 z-40 h-2 -translate-y-1 cursor-row-resize"
          data-testid="bottom-pane-resizer"
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onHeightChange(clamp(height + 12, minHeight, bottomPaneMaxHeight(minHeight)));
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onHeightChange(clamp(height - 12, minHeight, bottomPaneMaxHeight(minHeight)));
            }
          }}
          onPointerDown={startResize}
          role="separator"
          tabIndex={0}
        />
      ) : null}
    </div>
  );
}

function bottomPaneMaxHeight(minHeight: number) {
  return Math.max(minHeight, window.innerHeight - 96);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
