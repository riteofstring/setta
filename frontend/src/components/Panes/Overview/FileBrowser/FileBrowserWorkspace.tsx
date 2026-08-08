import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { clamp } from "utils/utils";
import { FileBrowserPane, type FileNode } from "./FileBrowserPane";
import { FileBrowserUniversalPreview } from "./FileBrowserUniversalPreview";

const DEFAULT_PREVIEW_HEIGHT_PCT = 42;
const MIN_PREVIEW_HEIGHT_PCT = 24;
const MIN_LIST_HEIGHT_PCT = 32;

type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

export function getListHeightPct({
  previewHeightPct,
  isPreviewMinimized,
}: {
  previewHeightPct: number;
  isPreviewMinimized: boolean;
}): number {
  if (isPreviewMinimized) {
    return 100;
  }
  return clamp(100 - previewHeightPct, MIN_LIST_HEIGHT_PCT, 100);
}

export function getPreviewHeightPctFromPointer({
  pointerClientY,
  containerTop,
  containerHeight,
}: {
  pointerClientY: number;
  containerTop: number;
  containerHeight: number;
}): number {
  const offsetY = pointerClientY - containerTop;
  const rawListPct = (offsetY / containerHeight) * 100;
  const boundedListPct = clamp(
    rawListPct,
    MIN_LIST_HEIGHT_PCT,
    100 - MIN_PREVIEW_HEIGHT_PCT,
  );
  return 100 - boundedListPct;
}

export function attachPreviewResizeListeners(args: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  const { target, onMove, onUp } = args;
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}

export function FileBrowserWorkspace({
  metaPaddingClassName,
  listInsetLeft,
}: {
  metaPaddingClassName: string;
  listInsetLeft: number;
}) {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [previewHeightPct, setPreviewHeightPct] = useState(
    DEFAULT_PREVIEW_HEIGHT_PCT,
  );
  const [isPreviewMinimized, setIsPreviewMinimized] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  const listHeightPct = useMemo(() => {
    return getListHeightPct({
      previewHeightPct,
      isPreviewMinimized,
    });
  }, [isPreviewMinimized, previewHeightPct]);

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isPreviewMinimized) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      const pointerId = event.pointerId;

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        setPreviewHeightPct(
          getPreviewHeightPctFromPointer({
            pointerClientY: moveEvent.clientY,
            containerTop: bounds.top,
            containerHeight: bounds.height,
          }),
        );
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current?.();
      const cleanup = attachPreviewResizeListeners({
        target: window,
        onMove,
        onUp,
      });
      resizeCleanupRef.current = cleanup;
    },
    [isPreviewMinimized],
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-col pb-2"
    >
      <div
        data-testid="file-browser-list-pane"
        className="min-h-[220px] min-w-0 shrink-0"
        style={{ flexBasis: `${listHeightPct}%` }}
      >
        <FileBrowserPane
          metaPaddingClassName={metaPaddingClassName}
          listInsetLeft={listInsetLeft}
          onSelectionChange={setSelectedNode}
        />
      </div>

      {!isPreviewMinimized ? (
        <div
          data-testid="file-browser-preview-resize-handle"
          role="separator"
          aria-label="Resize file browser preview pane"
          className="group/resize relative h-3 cursor-row-resize"
          onPointerDown={beginResize}
          onDoubleClick={() => setPreviewHeightPct(DEFAULT_PREVIEW_HEIGHT_PCT)}
        >
          <div className="absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
        </div>
      ) : null}

      <div className="flex items-center justify-between border-y border-setta-200/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-setta-500 dark:border-setta-800/80 dark:text-setta-400">
        <span>Preview</span>
        <button
          type="button"
          data-testid="file-browser-preview-toggle"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-setta-600 transition-colors hover:bg-setta-100 hover:text-setta-800 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => setIsPreviewMinimized((prev) => !prev)}
          aria-expanded={!isPreviewMinimized}
        >
          {isPreviewMinimized ? (
            <FiChevronUp size={12} />
          ) : (
            <FiChevronDown size={12} />
          )}
          {isPreviewMinimized ? "Expand" : "Minimize"}
        </button>
      </div>

      {!isPreviewMinimized ? (
        <div
          data-testid="file-browser-preview-pane"
          className="min-h-[180px] min-w-0 flex-1 pr-2 pt-2"
          style={{ flexBasis: `${previewHeightPct}%` }}
        >
          <FileBrowserUniversalPreview selectedNode={selectedNode} />
        </div>
      ) : null}
    </div>
  );
}
