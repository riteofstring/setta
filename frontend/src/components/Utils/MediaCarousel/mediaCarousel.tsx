import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MediaCarouselItem,
  MediaCarouselPreviewFrame,
  MediaCarouselProps,
  MediaCarouselSelectionState,
  MediaCarouselThumbnailResizeSlot,
  MediaCarouselThumbnailRowState,
  MediaCarouselThumbnailStrip,
  THUMBNAIL_ROW_MIN_PREVIEW_HEIGHT_PX,
  ThumbnailRowHeightOptions,
  getPreviewContent,
  getSelectedItemId,
  getThumbnailClassNames,
  getThumbnailRowHeights,
  getThumbnailRowLayout,
  isTextEntryTarget,
  normalizeMediaCarouselProps,
  renderOptionalNode,
  shouldShowNavButtons,
  useHasThumbnailSubLabel,
  useMediaCarouselSelectionState,
} from "./carouselState";

export function useMediaCarouselNavigation<T>({
  handleSelect,
  items,
  selectedIndex,
}: {
  handleSelect: (id: string) => void;
  items: Array<MediaCarouselItem<T>>;
  selectedIndex: number;
}): Pick<
  MediaCarouselSelectionState<T>,
  "handleKeyDown" | "handleNext" | "handlePrev"
> {
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
      if (isTextEntryTarget(event.target)) {
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

  return {
    handleKeyDown,
    handleNext,
    handlePrev,
  };
}

export function useMediaCarouselThumbnailRowState({
  hasSubLabel,
  resolvedThumbnailRowMinScale,
  showThumbnailLabels,
  thumbnailRowResizable,
  thumbnailSize,
  wrapperRef,
}: ThumbnailRowHeightOptions & {
  thumbnailRowResizable: boolean;
  wrapperRef: React.RefObject<HTMLDivElement>;
}): MediaCarouselThumbnailRowState {
  const {
    defaultHeightPx: thumbnailRowDefaultHeightPx,
    minHeightPx: thumbnailRowMinHeightPx,
  } = getThumbnailRowHeights({
    hasSubLabel,
    resolvedThumbnailRowMinScale,
    showThumbnailLabels,
    thumbnailSize,
  });
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
        const delta = startY - moveEvent.clientY;
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
      window.addEventListener("pointercancel", handlePointerUp, {
        once: true,
      });
    },
    [
      thumbnailRowHeightPx,
      thumbnailRowMinHeightPx,
      thumbnailRowResizable,
      wrapperRef,
    ],
  );

  const thumbnailRowLayout = useMemo(
    () =>
      getThumbnailRowLayout({
        hasSubLabel,
        resolvedThumbnailRowMinScale,
        showThumbnailLabels,
        thumbnailRowHeightPx,
        thumbnailRowResizable,
        thumbnailSize,
      }),
    [
      hasSubLabel,
      resolvedThumbnailRowMinScale,
      showThumbnailLabels,
      thumbnailRowHeightPx,
      thumbnailRowResizable,
      thumbnailSize,
    ],
  );

  return {
    handleThumbnailRowResizePointerDown,
    thumbnailRowLayout,
    thumbnailRowMinHeightPx,
  };
}

export function MediaCarousel<T>(props: MediaCarouselProps<T>) {
  const {
    containerClassName,
    footer,
    isThumbnailDraggable,
    items,
    onSelect,
    onThumbnailDoubleClick,
    onThumbnailDragStart,
    previewClassName,
    renderPreview,
    renderThumbnail,
    renderThumbnailOverlay,
    selectedId,
    selectedThumbnailClassName,
    showNavButtons,
    showThumbnailLabels,
    thumbnailClassName,
    thumbnailRowClassName,
    thumbnailRowMinScale,
    thumbnailRowResizable,
    thumbnailSize,
  } = normalizeMediaCarouselProps(props);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hasExternalSelection = selectedId !== undefined;
  const hasNavButtons = shouldShowNavButtons(showNavButtons, items.length);
  const hasSubLabel = useHasThumbnailSubLabel(items);
  const { handleSelect, selectedIndex, selectedItem } =
    useMediaCarouselSelectionState({
      hasExternalSelection,
      items,
      onSelect,
      selectedId,
    });
  const { handleKeyDown, handleNext, handlePrev } = useMediaCarouselNavigation({
    handleSelect,
    items,
    selectedIndex,
  });
  const {
    handleThumbnailRowResizePointerDown,
    thumbnailRowLayout,
    thumbnailRowMinHeightPx,
  } = useMediaCarouselThumbnailRowState({
    hasSubLabel,
    resolvedThumbnailRowMinScale: thumbnailRowMinScale,
    showThumbnailLabels,
    thumbnailRowResizable,
    thumbnailSize,
    wrapperRef,
  });

  if (items.length === 0) {
    return null;
  }

  const previewContent = getPreviewContent(selectedItem, renderPreview);
  const wrapperClasses = [
    "group/media-carousel flex min-h-0 flex-1 flex-col gap-2",
    containerClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const { resolvedSelectedThumbnailClassName, resolvedThumbnailClassName } =
    getThumbnailClassNames(thumbnailClassName, selectedThumbnailClassName);

  return (
    <div
      ref={wrapperRef}
      className={wrapperClasses}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <MediaCarouselPreviewFrame
        hasNavButtons={hasNavButtons}
        onNext={handleNext}
        onPrev={handlePrev}
        previewClassName={previewClassName}
        previewContent={previewContent}
      />
      {renderOptionalNode(footer)}
      <MediaCarouselThumbnailResizeSlot
        onPointerDown={handleThumbnailRowResizePointerDown}
        thumbnailRowResizable={thumbnailRowResizable}
      />
      <MediaCarouselThumbnailStrip
        isThumbnailDraggable={isThumbnailDraggable}
        items={items}
        labelMode={thumbnailRowLayout.labelMode}
        onSelect={handleSelect}
        onThumbnailDoubleClick={onThumbnailDoubleClick}
        onThumbnailDragStart={onThumbnailDragStart}
        renderThumbnail={renderThumbnail}
        renderThumbnailOverlay={renderThumbnailOverlay}
        resolvedSelectedThumbnailClassName={resolvedSelectedThumbnailClassName}
        resolvedThumbnailClassName={resolvedThumbnailClassName}
        rowHeightPx={thumbnailRowLayout.rowHeightPx}
        selectedItemId={getSelectedItemId(selectedItem)}
        showThumbnailLabels={showThumbnailLabels}
        thumbnailRowClassName={thumbnailRowClassName}
        thumbnailRowMinHeightPx={thumbnailRowMinHeightPx}
        thumbnailRowResizable={thumbnailRowResizable}
        thumbnailSizePx={thumbnailRowLayout.thumbnailSizePx}
      />
    </div>
  );
}
