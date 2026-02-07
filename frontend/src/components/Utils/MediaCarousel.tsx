import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiChevronLeft, FiChevronRight, FiFileText } from "react-icons/fi";
import { IoImageOutline } from "react-icons/io5";
import {
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

export type MediaCarouselItem<T = unknown> = {
  id: string;
  label: string;
  subLabel?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  text?: string | null;
  data?: T;
};

type MediaCarouselProps<T = unknown> = {
  items: Array<MediaCarouselItem<T>>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  renderPreview?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  onThumbnailDoubleClick?: (item: MediaCarouselItem<T>) => void;
  showThumbnailLabels?: boolean;
  thumbnailSize?: number;
  showNavButtons?: boolean;
  containerClassName?: string;
  previewClassName?: string;
  thumbnailRowClassName?: string;
  thumbnailClassName?: string;
  selectedThumbnailClassName?: string;
  thumbnailRowResizable?: boolean;
  thumbnailRowMinScale?: number;
  footer?: ReactNode;
};

const DEFAULT_THUMBNAIL_SIZE = 96;
const DEFAULT_THUMBNAIL_ROW_MIN_SCALE = 0.5;
const THUMBNAIL_ROW_PADDING_Y_PX = 8;
const THUMBNAIL_LABEL_GAP_PX = 4;
const THUMBNAIL_LABEL_LINE_HEIGHT_PX = 16;
const THUMBNAIL_LABEL_NORMAL_LINES = 2;
const THUMBNAIL_ROW_MIN_PREVIEW_HEIGHT_PX = 140;

export function MediaCarousel<T>({
  items,
  selectedId,
  onSelect,
  renderPreview,
  renderThumbnail,
  renderThumbnailOverlay,
  onThumbnailDoubleClick,
  showThumbnailLabels = true,
  thumbnailSize = DEFAULT_THUMBNAIL_SIZE,
  showNavButtons = false,
  containerClassName,
  previewClassName,
  thumbnailRowClassName,
  thumbnailClassName,
  selectedThumbnailClassName,
  thumbnailRowResizable = false,
  thumbnailRowMinScale = DEFAULT_THUMBNAIL_ROW_MIN_SCALE,
  footer,
}: MediaCarouselProps<T>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hasExternalSelection = selectedId !== undefined;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedId ?? null,
  );
  const resolvedSelectedId = hasExternalSelection
    ? selectedId ?? null
    : internalSelectedId;
  const selectedItem = useMemo(() => {
    if (!resolvedSelectedId) {
      return null;
    }
    return (
      items.find((item) => item.id === resolvedSelectedId) ?? items[0] ?? null
    );
  }, [items, resolvedSelectedId]);
  const selectedIndex = useMemo(() => {
    if (!selectedItem) {
      return -1;
    }
    return items.findIndex((item) => item.id === selectedItem.id);
  }, [items, selectedItem]);
  const hasNavButtons = showNavButtons && items.length > 1;

  const resolvedThumbnailRowMinScale =
    thumbnailRowMinScale ?? DEFAULT_THUMBNAIL_ROW_MIN_SCALE;
  const minThumbnailSizePx = Math.max(
    1,
    Math.round(thumbnailSize * resolvedThumbnailRowMinScale),
  );
  const thumbnailRowMinHeightPx =
    THUMBNAIL_ROW_PADDING_Y_PX * 2 +
    minThumbnailSizePx +
    (showThumbnailLabels
      ? THUMBNAIL_LABEL_GAP_PX + THUMBNAIL_LABEL_LINE_HEIGHT_PX
      : 0);
  const thumbnailRowDefaultHeightPx =
    THUMBNAIL_ROW_PADDING_Y_PX * 2 +
    thumbnailSize +
    (showThumbnailLabels
      ? THUMBNAIL_LABEL_GAP_PX +
        THUMBNAIL_LABEL_LINE_HEIGHT_PX * THUMBNAIL_LABEL_NORMAL_LINES
      : 0);
  const [thumbnailRowHeightPx, setThumbnailRowHeightPx] = useState<number>(
    thumbnailRowDefaultHeightPx,
  );

  useEffect(() => {
    if (!thumbnailRowResizable) {
      return;
    }
    setThumbnailRowHeightPx((prev) => {
      const next = prev || thumbnailRowDefaultHeightPx;
      return Math.max(thumbnailRowMinHeightPx, next);
    });
  }, [
    thumbnailRowDefaultHeightPx,
    thumbnailRowMinHeightPx,
    thumbnailRowResizable,
  ]);

  const handleThumbnailRowResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!thumbnailRowResizable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = thumbnailRowHeightPx;
      const wrapperHeight = wrapperRef.current?.clientHeight ?? 0;
      const maxHeight =
        wrapperHeight > 0
          ? Math.max(
              thumbnailRowMinHeightPx,
              wrapperHeight - THUMBNAIL_ROW_MIN_PREVIEW_HEIGHT_PX,
            )
          : startHeight + 400;

      function handlePointerMove(moveEvent: PointerEvent) {
        const delta = moveEvent.clientY - startY;
        const next = Math.max(
          thumbnailRowMinHeightPx,
          Math.min(maxHeight, startHeight + delta),
        );
        setThumbnailRowHeightPx(next);
      }

      function handlePointerUp() {
        window.removeEventListener("pointermove", handlePointerMove);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
      window.addEventListener("pointercancel", handlePointerUp, { once: true });
    },
    [
      thumbnailRowHeightPx,
      thumbnailRowMinHeightPx,
      thumbnailRowResizable,
      wrapperRef,
    ],
  );

  const thumbnailRowLayout = useMemo(() => {
    if (!thumbnailRowResizable) {
      return {
        thumbnailSizePx: thumbnailSize,
        labelMode: "wrap" as const,
        rowHeightPx: null as number | null,
      };
    }
    const availableHeight =
      thumbnailRowHeightPx - THUMBNAIL_ROW_PADDING_Y_PX * 2;
    const normalLabelHeight = showThumbnailLabels
      ? THUMBNAIL_LABEL_GAP_PX +
        THUMBNAIL_LABEL_LINE_HEIGHT_PX * THUMBNAIL_LABEL_NORMAL_LINES
      : 0;
    const compactLabelHeight = showThumbnailLabels
      ? THUMBNAIL_LABEL_GAP_PX + THUMBNAIL_LABEL_LINE_HEIGHT_PX
      : 0;

    const normalScale = (availableHeight - normalLabelHeight) / thumbnailSize;
    if (normalScale >= resolvedThumbnailRowMinScale) {
      const scale = Math.min(1, Math.max(resolvedThumbnailRowMinScale, normalScale));
      return {
        thumbnailSizePx: Math.max(1, Math.round(thumbnailSize * scale)),
        labelMode: "wrap" as const,
        rowHeightPx: thumbnailRowHeightPx,
      };
    }

    const compactScale = (availableHeight - compactLabelHeight) / thumbnailSize;
    const scale = Math.min(1, Math.max(resolvedThumbnailRowMinScale, compactScale));
    return {
      thumbnailSizePx: Math.max(1, Math.round(thumbnailSize * scale)),
      labelMode: "compact" as const,
      rowHeightPx: thumbnailRowHeightPx,
    };
  }, [
    resolvedThumbnailRowMinScale,
    showThumbnailLabels,
    thumbnailRowHeightPx,
    thumbnailRowResizable,
    thumbnailSize,
  ]);

  useEffect(() => {
    if (items.length === 0) {
      if (!hasExternalSelection) {
        setInternalSelectedId(null);
      }
      return;
    }
    const isValid =
      resolvedSelectedId &&
      items.some((item) => item.id === resolvedSelectedId);
    if (isValid) {
      return;
    }
    const preferred =
      items.find((item) => item.imageUrl || item.thumbnailUrl) ?? items[0];
    if (!preferred) {
      return;
    }
    if (hasExternalSelection) {
      if (onSelect) {
        onSelect(preferred.id);
      }
      return;
    }
    setInternalSelectedId(preferred.id);
    if (onSelect) {
      onSelect(preferred.id);
    }
  }, [hasExternalSelection, items, onSelect, resolvedSelectedId]);

  const handleSelect = useCallback(
    (id: string) => {
      if (!hasExternalSelection) {
        setInternalSelectedId(id);
      }
      if (onSelect) {
        onSelect(id);
      }
    },
    [hasExternalSelection, onSelect],
  );

  const handlePrev = useCallback(() => {
    if (items.length < 2 || selectedIndex < 0) {
      return;
    }
    const nextIndex = (selectedIndex - 1 + items.length) % items.length;
    const nextItem = items[nextIndex];
    if (nextItem) {
      handleSelect(nextItem.id);
    }
  }, [handleSelect, items, selectedIndex]);

  const handleNext = useCallback(() => {
    if (items.length < 2 || selectedIndex < 0) {
      return;
    }
    const nextIndex = (selectedIndex + 1) % items.length;
    const nextItem = items[nextIndex];
    if (nextItem) {
      handleSelect(nextItem.id);
    }
  }, [handleSelect, items, selectedIndex]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
    },
    [handleNext, handlePrev],
  );

  if (items.length === 0) {
    return null;
  }

  const resolvedPreview = selectedItem ? renderPreview?.(selectedItem) : null;
  const previewContent = resolvedPreview ?? renderDefaultPreview(selectedItem);

  const previewContainerClasses = [
    "relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-lg",
    "bg-transparent dark:bg-setta-860",
    NO_WHEEL_CLASS_NAME,
    previewClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const previewInnerClasses = [
    "flex h-full w-full items-center justify-center",
    // Keep carousel controls off interactive previews (audio/video controls).
    hasNavButtons ? "px-14" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wrapperClasses = [
    "group/media-carousel flex min-h-0 flex-1 flex-col gap-2",
    containerClassName,
  ]
    .filter(Boolean)
    .join(" ");

	  const thumbnailRowClasses = [
	    // `px-2` prevents selected thumbnails (scale + shadow) from being clipped.
	    thumbnailRowResizable
	      ? "flex shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 py-2"
	      : "flex shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 pb-4 pt-[4px]",
	    NO_PAN_CLASS_NAME,
	    // Keep wheel events from being intercepted by the canvas zoom handler.
	    NO_WHEEL_CLASS_NAME,
	    thumbnailRowClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const defaultThumbnailClassName =
    "border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800";
  const defaultSelectedThumbnailClassName = "border-blue-500 shadow-md";
  const resolvedThumbnailClassName =
    thumbnailClassName ?? defaultThumbnailClassName;
  const resolvedSelectedThumbnailClassName =
    selectedThumbnailClassName ?? defaultSelectedThumbnailClassName;

  function renderDefaultPreview(item: MediaCarouselItem<T> | null): ReactNode {
    if (!item) {
      return (
        <div className="flex flex-col items-center justify-center text-setta-400 dark:text-setta-600">
          <IoImageOutline size={48} />
          <p className="mt-2 text-sm">Select an item to preview</p>
        </div>
      );
    }
    if (item.imageUrl) {
      return (
        <div className="relative h-full w-full">
          <img
            src={item.imageUrl}
            className="h-full w-full object-contain"
            alt={item.label}
          />
        </div>
      );
    }
    if (item.text) {
      return (
        <div className="max-w-lg p-4 text-sm text-setta-700 dark:text-setta-200">
          {item.text}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center text-setta-400 dark:text-setta-600">
        <IoImageOutline size={48} />
        <p className="mt-2 text-sm">Select an item to preview</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={wrapperClasses}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <section className={previewContainerClasses}>
        {hasNavButtons ? (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous item"
            className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
          >
            <FiChevronLeft />
          </button>
        ) : null}
        <div className={previewInnerClasses}>{previewContent}</div>
        {hasNavButtons ? (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next item"
            className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
          >
            <FiChevronRight />
          </button>
        ) : null}
      </section>
      {footer ? footer : null}

      {thumbnailRowResizable ? (
        <div
          role="separator"
          aria-label="Resize thumbnail strip"
          aria-orientation="horizontal"
          onPointerDown={handleThumbnailRowResizePointerDown}
          className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME} nodrag flex h-3 items-center justify-center cursor-row-resize select-none touch-none`}
        >
          <div className="h-1 w-12 rounded-full bg-setta-200/80 opacity-70 transition-opacity group-hover/media-carousel:opacity-100 dark:bg-setta-700/70" />
        </div>
      ) : null}

      <article
        className={thumbnailRowClasses}
        style={
          thumbnailRowResizable && thumbnailRowLayout.rowHeightPx
            ? {
                height: thumbnailRowLayout.rowHeightPx,
                minHeight: thumbnailRowMinHeightPx,
              }
            : undefined
        }
        onWheel={(event) => {
          // Make vertical trackpad scrolling move the horizontal thumbnail strip.
          // This also avoids needing to grab the scrollbar on platforms where
          // horizontal wheel deltas are inconsistent.
          if (event.ctrlKey) {
            return;
          }
          const container = event.currentTarget;
          if (container.scrollWidth <= container.clientWidth) {
            return;
          }
          const absX = Math.abs(event.deltaX);
          const absY = Math.abs(event.deltaY);
          if (absY <= absX) {
            return;
          }
          event.preventDefault();
          container.scrollLeft += event.deltaY;
        }}
      >
        {items.map((item) => {
          const isSelected = selectedItem?.id === item.id;
          const thumbnailContainerClassName = [
            "single-cell-container overflow-clip rounded-md border border-solid",
            isSelected
              ? resolvedSelectedThumbnailClassName
              : resolvedThumbnailClassName,
          ]
            .filter(Boolean)
            .join(" ");
          const customThumbnail = renderThumbnail?.(item);
          const dotIndex = item.label.lastIndexOf(".");
          const fileStem =
            dotIndex > 0 && dotIndex < item.label.length - 1
              ? item.label.slice(0, dotIndex)
              : item.label;
          const fileExtension =
            dotIndex > 0 && dotIndex < item.label.length - 1
              ? item.label.slice(dotIndex)
              : null;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSelect(item.id)}
              onDoubleClick={() => onThumbnailDoubleClick?.(item)}
              className={`group/thumbnail flex cursor-pointer flex-col items-center gap-1 bg-transparent p-0 text-left ${
                isSelected ? "scale-105" : ""
              }`}
              style={{ width: `${thumbnailRowLayout.thumbnailSizePx}px` }}
            >
              <div
                className={thumbnailContainerClassName}
                style={{
                  width: `${thumbnailRowLayout.thumbnailSizePx}px`,
                  height: `${thumbnailRowLayout.thumbnailSizePx}px`,
                }}
              >
                {customThumbnail ??
                  (item.thumbnailUrl ? (
                    <>
                      <img
                        src={item.thumbnailUrl}
                        className="single-cell-child z-10 h-full w-full object-cover"
                        alt={item.label}
                      />
                      <IoImageOutline className="single-cell-child z-0 place-self-center text-setta-200 dark:text-setta-600" />
                    </>
                  ) : (
                    <FiFileText
                      size={20}
                      className="single-cell-child place-self-center text-setta-200 dark:text-setta-600"
                    />
                  ))}
                {renderThumbnailOverlay ? renderThumbnailOverlay(item) : null}
              </div>
              {showThumbnailLabels ? (
                <div className="w-full">
                  {thumbnailRowLayout.labelMode === "compact" ? (
                    <p className="w-full text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
                      <span className="flex w-full min-w-0 items-baseline gap-0.5">
                        <span className="min-w-0 flex-1 truncate">
                          {fileStem}
                        </span>
                        {fileExtension ? (
                          <span className="shrink-0">{fileExtension}</span>
                        ) : null}
                      </span>
                    </p>
                  ) : thumbnailRowResizable ? (
                    <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                      {item.label}
                    </p>
                  ) : (
                    <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
                      {item.label}
                    </p>
                  )}
                  {item.subLabel ? (
                    <p className="w-full truncate text-center text-[10px] text-setta-400 dark:text-setta-500">
                      {item.subLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </article>
    </div>
  );
}
