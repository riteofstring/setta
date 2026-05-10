import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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

import { getFloatingBoxHandlers } from "../FloatingBox";

export type MediaCarouselItem<T = unknown> = {
  id: string;
  label: string;
  subLabel?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  text?: string | null;
  tooltipTitle?: string | null;
  tooltipContent?: string | null;
  data?: T;
};

export type MediaCarouselProps<T = unknown> = {
  items: Array<MediaCarouselItem<T>>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  renderPreview?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  onThumbnailDoubleClick?: (item: MediaCarouselItem<T>) => void;
  isThumbnailDraggable?: (item: MediaCarouselItem<T>) => boolean;
  onThumbnailDragStart?: (
    item: MediaCarouselItem<T>,
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
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

type ThumbnailRowLayout = {
  thumbnailSizePx: number;
  labelMode: "wrap" | "compact";
  rowHeightPx: number | null;
};

export type ThumbnailRowHeightOptions = {
  hasSubLabel: boolean;
  resolvedThumbnailRowMinScale: number;
  showThumbnailLabels: boolean;
  thumbnailSize: number;
};

type MediaCarouselPreviewFrameProps = {
  hasNavButtons: boolean;
  onNext: () => void;
  onPrev: () => void;
  previewClassName?: string;
  previewContent: ReactNode;
};

type MediaCarouselNavButtonProps = {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  onClick: () => void;
};

type MediaCarouselThumbnailButtonProps<T> = {
  isSelected: boolean;
  item: MediaCarouselItem<T>;
  labelMode: ThumbnailRowLayout["labelMode"];
  onSelect: (id: string) => void;
  onThumbnailDoubleClick?: (item: MediaCarouselItem<T>) => void;
  onThumbnailDragStart?: (
    item: MediaCarouselItem<T>,
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  resolvedSelectedThumbnailClassName: string;
  resolvedThumbnailClassName: string;
  showThumbnailLabels: boolean;
  thumbnailSizePx: number;
  isThumbnailDraggable?: (item: MediaCarouselItem<T>) => boolean;
};

type MediaCarouselThumbnailStripProps<T> = {
  isThumbnailDraggable?: (item: MediaCarouselItem<T>) => boolean;
  items: Array<MediaCarouselItem<T>>;
  labelMode: ThumbnailRowLayout["labelMode"];
  onSelect: (id: string) => void;
  onThumbnailDoubleClick?: (item: MediaCarouselItem<T>) => void;
  onThumbnailDragStart?: (
    item: MediaCarouselItem<T>,
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  resolvedSelectedThumbnailClassName: string;
  resolvedThumbnailClassName: string;
  rowHeightPx: number | null;
  selectedItemId: string | null;
  showThumbnailLabels: boolean;
  thumbnailRowClassName?: string;
  thumbnailRowMinHeightPx: number;
  thumbnailRowResizable: boolean;
  thumbnailSizePx: number;
};

export type MediaCarouselSelectionState<T> = {
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  handleNext: () => void;
  handlePrev: () => void;
  handleSelect: (id: string) => void;
  selectedItem: MediaCarouselItem<T> | null;
};

type MediaCarouselSelectionSync = {
  nextInternalSelectedId?: string | null;
  nextSelectedIdToNotify?: string;
};

export type MediaCarouselThumbnailRowState = {
  handleThumbnailRowResizePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  thumbnailRowLayout: ThumbnailRowLayout;
  thumbnailRowMinHeightPx: number;
};

type NormalizedMediaCarouselProps<T> = {
  containerClassName?: string;
  footer?: ReactNode;
  isThumbnailDraggable?: (item: MediaCarouselItem<T>) => boolean;
  items: Array<MediaCarouselItem<T>>;
  onSelect?: (id: string) => void;
  onThumbnailDoubleClick?: (item: MediaCarouselItem<T>) => void;
  onThumbnailDragStart?: (
    item: MediaCarouselItem<T>,
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
  previewClassName?: string;
  renderPreview?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  selectedId?: string | null;
  selectedThumbnailClassName?: string;
  showNavButtons: boolean;
  showThumbnailLabels: boolean;
  thumbnailClassName?: string;
  thumbnailRowClassName?: string;
  thumbnailRowMinScale: number;
  thumbnailRowResizable: boolean;
  thumbnailSize: number;
};

const DEFAULT_THUMBNAIL_SIZE = 96;

const DEFAULT_THUMBNAIL_ROW_MIN_SCALE = 0.5;

const THUMBNAIL_ROW_PADDING_Y_PX = 8;

const THUMBNAIL_LABEL_GAP_PX = 4;

const THUMBNAIL_LABEL_LINE_HEIGHT_PX = 16;

const THUMBNAIL_SUB_LABEL_LINE_HEIGHT_PX = 16;

const THUMBNAIL_LABEL_NORMAL_LINES = 1;

export const THUMBNAIL_ROW_MIN_PREVIEW_HEIGHT_PX = 140;

const THUMBNAIL_ROW_COMPACT_LABEL_SCALE_THRESHOLD = 0.75;

export function getThumbnailRowHeights({
  hasSubLabel,
  resolvedThumbnailRowMinScale,
  showThumbnailLabels,
  thumbnailSize,
}: ThumbnailRowHeightOptions) {
  const minThumbnailSizePx = Math.max(
    1,
    Math.round(thumbnailSize * resolvedThumbnailRowMinScale),
  );
  const minLabelHeight = showThumbnailLabels
    ? THUMBNAIL_LABEL_GAP_PX + THUMBNAIL_LABEL_LINE_HEIGHT_PX
    : 0;
  const defaultLabelHeight = showThumbnailLabels
    ? THUMBNAIL_LABEL_GAP_PX +
      THUMBNAIL_LABEL_LINE_HEIGHT_PX * THUMBNAIL_LABEL_NORMAL_LINES +
      (hasSubLabel ? THUMBNAIL_SUB_LABEL_LINE_HEIGHT_PX : 0)
    : 0;

  return {
    defaultHeightPx:
      THUMBNAIL_ROW_PADDING_Y_PX * 2 + thumbnailSize + defaultLabelHeight,
    minHeightPx:
      THUMBNAIL_ROW_PADDING_Y_PX * 2 + minThumbnailSizePx + minLabelHeight,
  };
}

export function normalizeMediaCarouselProps<T>(
  props: MediaCarouselProps<T>,
): NormalizedMediaCarouselProps<T> {
  return {
    ...props,
    showNavButtons: props.showNavButtons ?? false,
    showThumbnailLabels: props.showThumbnailLabels ?? true,
    thumbnailRowMinScale:
      props.thumbnailRowMinScale ?? DEFAULT_THUMBNAIL_ROW_MIN_SCALE,
    thumbnailRowResizable: props.thumbnailRowResizable ?? false,
    thumbnailSize: props.thumbnailSize ?? DEFAULT_THUMBNAIL_SIZE,
  };
}

export function getThumbnailRowLayout({
  hasSubLabel,
  resolvedThumbnailRowMinScale,
  showThumbnailLabels,
  thumbnailRowHeightPx,
  thumbnailRowResizable,
  thumbnailSize,
}: ThumbnailRowHeightOptions & {
  thumbnailRowHeightPx: number;
  thumbnailRowResizable: boolean;
}): ThumbnailRowLayout {
  if (!thumbnailRowResizable) {
    return {
      thumbnailSizePx: thumbnailSize,
      labelMode: "wrap",
      rowHeightPx: null,
    };
  }

  const availableHeight = thumbnailRowHeightPx - THUMBNAIL_ROW_PADDING_Y_PX * 2;
  const normalLabelHeight = showThumbnailLabels
    ? THUMBNAIL_LABEL_GAP_PX +
      THUMBNAIL_LABEL_LINE_HEIGHT_PX * THUMBNAIL_LABEL_NORMAL_LINES +
      (hasSubLabel ? THUMBNAIL_SUB_LABEL_LINE_HEIGHT_PX : 0)
    : 0;
  const compactLabelHeight = showThumbnailLabels
    ? THUMBNAIL_LABEL_GAP_PX + THUMBNAIL_LABEL_LINE_HEIGHT_PX
    : 0;
  const normalScale = (availableHeight - normalLabelHeight) / thumbnailSize;
  if (normalScale >= THUMBNAIL_ROW_COMPACT_LABEL_SCALE_THRESHOLD) {
    const scale = Math.min(
      1,
      Math.max(resolvedThumbnailRowMinScale, normalScale),
    );
    return {
      thumbnailSizePx: Math.max(1, Math.round(thumbnailSize * scale)),
      labelMode: "wrap",
      rowHeightPx: thumbnailRowHeightPx,
    };
  }

  const compactScale = (availableHeight - compactLabelHeight) / thumbnailSize;
  const scale = Math.min(
    1,
    Math.max(resolvedThumbnailRowMinScale, compactScale),
  );
  return {
    thumbnailSizePx: Math.max(1, Math.round(thumbnailSize * scale)),
    labelMode: "compact",
    rowHeightPx: thumbnailRowHeightPx,
  };
}

function renderDefaultPreview<T>(item: MediaCarouselItem<T> | null): ReactNode {
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

export function isTextEntryTarget(
  target: EventTarget | null,
): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function handleThumbnailStripWheel(event: React.WheelEvent<HTMLElement>): void {
  const container = event.currentTarget;
  if (
    event.ctrlKey ||
    container.scrollWidth <= container.clientWidth ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX)
  ) {
    return;
  }
  event.preventDefault();
  container.scrollLeft += event.deltaY;
}

export function shouldShowNavButtons(
  showNavButtons: boolean,
  itemCount: number,
) {
  return showNavButtons && itemCount > 1;
}

export function useHasThumbnailSubLabel<T>(items: Array<MediaCarouselItem<T>>) {
  return useMemo(
    () => items.some((item) => (item.subLabel ?? "").trim().length > 0),
    [items],
  );
}

export function getPreviewContent<T>(
  selectedItem: MediaCarouselItem<T> | null,
  renderPreview?: (item: MediaCarouselItem<T>) => ReactNode,
) {
  const resolvedPreview = selectedItem ? renderPreview?.(selectedItem) : null;
  return resolvedPreview ?? renderDefaultPreview(selectedItem);
}

export function getThumbnailClassNames(
  thumbnailClassName: string | undefined,
  selectedThumbnailClassName: string | undefined,
) {
  const defaultThumbnailClassName =
    "border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800";
  const defaultSelectedThumbnailClassName = "border-blue-500 shadow-md";
  return {
    resolvedSelectedThumbnailClassName:
      selectedThumbnailClassName ?? defaultSelectedThumbnailClassName,
    resolvedThumbnailClassName: thumbnailClassName ?? defaultThumbnailClassName,
  };
}

export function renderOptionalNode(node: ReactNode | undefined) {
  return node ? node : null;
}

export function getSelectedItemId<T>(
  selectedItem: MediaCarouselItem<T> | null,
) {
  return selectedItem?.id ?? null;
}

function hasResolvedMediaCarouselSelection<T>(
  items: Array<MediaCarouselItem<T>>,
  resolvedSelectedId: string | null,
) {
  return (
    resolvedSelectedId !== null &&
    items.some((item) => item.id === resolvedSelectedId)
  );
}

function getPreferredMediaCarouselItem<T>(items: Array<MediaCarouselItem<T>>) {
  return items.find((item) => item.imageUrl || item.thumbnailUrl) ?? items[0];
}

function resolveMediaCarouselSelectionSync<T>({
  hasExternalSelection,
  items,
  resolvedSelectedId,
}: {
  hasExternalSelection: boolean;
  items: Array<MediaCarouselItem<T>>;
  resolvedSelectedId: string | null;
}): MediaCarouselSelectionSync {
  if (items.length === 0) {
    return hasExternalSelection ? {} : { nextInternalSelectedId: null };
  }
  if (hasResolvedMediaCarouselSelection(items, resolvedSelectedId)) {
    return {};
  }
  const preferredItem = getPreferredMediaCarouselItem(items);
  if (!preferredItem) {
    return {};
  }
  if (hasExternalSelection) {
    return {
      nextSelectedIdToNotify: preferredItem.id,
    };
  }
  return {
    nextInternalSelectedId: preferredItem.id,
    nextSelectedIdToNotify: preferredItem.id,
  };
}

function MediaCarouselNavButton({
  ariaLabel,
  children,
  className,
  onClick,
}: MediaCarouselNavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}

export function MediaCarouselPreviewFrame({
  hasNavButtons,
  onNext,
  onPrev,
  previewClassName,
  previewContent,
}: MediaCarouselPreviewFrameProps) {
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
    hasNavButtons ? "px-14" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={previewContainerClasses}>
      {hasNavButtons ? (
        <MediaCarouselNavButton
          ariaLabel="Previous item"
          onClick={onPrev}
          className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
        >
          <FiChevronLeft />
        </MediaCarouselNavButton>
      ) : null}
      <div className={previewInnerClasses}>{previewContent}</div>
      {hasNavButtons ? (
        <MediaCarouselNavButton
          ariaLabel="Next item"
          onClick={onNext}
          className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
        >
          <FiChevronRight />
        </MediaCarouselNavButton>
      ) : null}
    </section>
  );
}

function MediaCarouselThumbnailResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label="Resize thumbnail strip"
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      className={`${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME} nodrag flex h-3 cursor-row-resize touch-none select-none items-center justify-center`}
    >
      <div className="h-1 w-12 rounded-full bg-setta-200/80 opacity-70 transition-opacity group-hover/media-carousel:opacity-100 dark:bg-setta-700/70" />
    </div>
  );
}

export function MediaCarouselThumbnailResizeSlot({
  onPointerDown,
  thumbnailRowResizable,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  thumbnailRowResizable: boolean;
}) {
  if (!thumbnailRowResizable) {
    return null;
  }
  return <MediaCarouselThumbnailResizeHandle onPointerDown={onPointerDown} />;
}

function splitFileLabel(label: string) {
  const dotIndex = label.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= label.length - 1) {
    return { fileExtension: null, fileStem: label };
  }
  return {
    fileExtension: label.slice(dotIndex),
    fileStem: label.slice(0, dotIndex),
  };
}

function getThumbnailTooltipHandlers<T>(item: MediaCarouselItem<T>) {
  const tooltipContent = item.tooltipContent?.trim() ?? "";
  if (tooltipContent.length === 0) {
    return null;
  }
  return getFloatingBoxHandlers({
    title: item.tooltipTitle ?? "File path",
    content: tooltipContent,
  });
}

function getThumbnailContainerClassName(
  isSelected: boolean,
  resolvedSelectedThumbnailClassName: string,
  resolvedThumbnailClassName: string,
) {
  return [
    "single-cell-container shrink-0 overflow-clip rounded-md border border-solid",
    isSelected
      ? resolvedSelectedThumbnailClassName
      : resolvedThumbnailClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

function getThumbnailDragState<T>(
  item: MediaCarouselItem<T>,
  isThumbnailDraggable: MediaCarouselThumbnailButtonProps<T>["isThumbnailDraggable"],
  onThumbnailDragStart: MediaCarouselThumbnailButtonProps<T>["onThumbnailDragStart"],
) {
  const isDraggable = isThumbnailDraggable?.(item) === true;
  const onDragStart =
    isDraggable && onThumbnailDragStart
      ? (event: ReactDragEvent<HTMLButtonElement>) =>
          onThumbnailDragStart(item, event)
      : undefined;
  return { isDraggable, onDragStart };
}

function renderThumbnailFallback<T>(item: MediaCarouselItem<T>) {
  if (item.thumbnailUrl) {
    return (
      <>
        <img
          src={item.thumbnailUrl}
          className="single-cell-child z-10 h-full w-full object-cover"
          alt={item.label}
        />
        <IoImageOutline className="single-cell-child z-0 place-self-center text-setta-200 dark:text-setta-600" />
      </>
    );
  }
  return (
    <FiFileText
      size={20}
      className="single-cell-child place-self-center text-setta-200 dark:text-setta-600"
    />
  );
}

function MediaCarouselThumbnailVisual<T>({
  item,
  renderThumbnail,
  renderThumbnailOverlay,
  thumbnailContainerClassName,
  thumbnailSizePx,
}: {
  item: MediaCarouselItem<T>;
  renderThumbnail?: (item: MediaCarouselItem<T>) => ReactNode;
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  thumbnailContainerClassName: string;
  thumbnailSizePx: number;
}) {
  const customThumbnail = renderThumbnail?.(item);
  return (
    <div
      className={thumbnailContainerClassName}
      style={{
        width: `${thumbnailSizePx}px`,
        height: `${thumbnailSizePx}px`,
      }}
    >
      {customThumbnail ?? renderThumbnailFallback(item)}
      {renderThumbnailOverlay ? renderThumbnailOverlay(item) : null}
    </div>
  );
}

function MediaCarouselThumbnailLabels({
  fileExtension,
  fileStem,
  labelMode,
  showThumbnailLabels,
  subLabel,
}: {
  fileExtension: string | null;
  fileStem: string;
  labelMode: ThumbnailRowLayout["labelMode"];
  showThumbnailLabels: boolean;
  subLabel?: string | null;
}) {
  if (!showThumbnailLabels) {
    return null;
  }

  return (
    <div className="w-full">
      <p className="flex w-full justify-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
        <span className="flex min-w-0 max-w-full items-baseline gap-0.5">
          <span className="min-w-0 flex-1 truncate">{fileStem}</span>
          {fileExtension ? (
            <span className="shrink-0">{fileExtension}</span>
          ) : null}
        </span>
      </p>
      {subLabel && labelMode !== "compact" ? (
        <p className="w-full truncate text-center text-[10px] text-setta-400 dark:text-setta-500">
          {subLabel}
        </p>
      ) : null}
    </div>
  );
}

function MediaCarouselThumbnailButton<T>({
  isSelected,
  item,
  labelMode,
  onSelect,
  onThumbnailDoubleClick,
  onThumbnailDragStart,
  renderThumbnail,
  renderThumbnailOverlay,
  resolvedSelectedThumbnailClassName,
  resolvedThumbnailClassName,
  showThumbnailLabels,
  thumbnailSizePx,
  isThumbnailDraggable,
}: MediaCarouselThumbnailButtonProps<T>) {
  const tooltipHandlers = getThumbnailTooltipHandlers(item);
  const thumbnailContainerClassName = getThumbnailContainerClassName(
    isSelected,
    resolvedSelectedThumbnailClassName,
    resolvedThumbnailClassName,
  );
  const { fileExtension, fileStem } = splitFileLabel(item.label);
  const { isDraggable, onDragStart } = getThumbnailDragState(
    item,
    isThumbnailDraggable,
    onThumbnailDragStart,
  );

  return (
    <button
      type="button"
      aria-label={item.label}
      title={item.label}
      data-media-carousel-item-id={item.id}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onThumbnailDoubleClick?.(item)}
      draggable={isDraggable}
      onDragStart={onDragStart}
      {...(tooltipHandlers ?? {})}
      className={`group/thumbnail flex cursor-pointer flex-col items-center gap-1 bg-transparent p-0 text-left ${
        isSelected ? "scale-105" : ""
      }`}
      style={{ width: `${thumbnailSizePx}px` }}
    >
      <span className="sr-only">{item.label}</span>
      <MediaCarouselThumbnailVisual
        item={item}
        renderThumbnail={renderThumbnail}
        renderThumbnailOverlay={renderThumbnailOverlay}
        thumbnailContainerClassName={thumbnailContainerClassName}
        thumbnailSizePx={thumbnailSizePx}
      />
      <MediaCarouselThumbnailLabels
        fileExtension={fileExtension}
        fileStem={fileStem}
        labelMode={labelMode}
        showThumbnailLabels={showThumbnailLabels}
        subLabel={item.subLabel}
      />
    </button>
  );
}

export function MediaCarouselThumbnailStrip<T>({
  isThumbnailDraggable,
  items,
  labelMode,
  onSelect,
  onThumbnailDoubleClick,
  onThumbnailDragStart,
  renderThumbnail,
  renderThumbnailOverlay,
  resolvedSelectedThumbnailClassName,
  resolvedThumbnailClassName,
  rowHeightPx,
  selectedItemId,
  showThumbnailLabels,
  thumbnailRowClassName,
  thumbnailRowMinHeightPx,
  thumbnailRowResizable,
  thumbnailSizePx,
}: MediaCarouselThumbnailStripProps<T>) {
  const thumbnailRowClasses = [
    thumbnailRowResizable
      ? "setta-media-carousel-thumbnail-row flex items-start shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 py-2 [scrollbar-gutter:stable]"
      : "setta-media-carousel-thumbnail-row flex items-start shrink-0 gap-2 overflow-x-scroll overflow-y-hidden px-2 pb-4 pt-[4px] [scrollbar-gutter:stable]",
    NO_PAN_CLASS_NAME,
    NO_WHEEL_CLASS_NAME,
    thumbnailRowClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={thumbnailRowClasses}
      style={
        thumbnailRowResizable && rowHeightPx
          ? {
              height: rowHeightPx,
              minHeight: thumbnailRowMinHeightPx,
            }
          : undefined
      }
      onWheel={handleThumbnailStripWheel}
    >
      {items.map((item) => (
        <MediaCarouselThumbnailButton
          key={item.id}
          item={item}
          isSelected={selectedItemId === item.id}
          labelMode={labelMode}
          onSelect={onSelect}
          onThumbnailDoubleClick={onThumbnailDoubleClick}
          onThumbnailDragStart={onThumbnailDragStart}
          renderThumbnail={renderThumbnail}
          renderThumbnailOverlay={renderThumbnailOverlay}
          resolvedSelectedThumbnailClassName={
            resolvedSelectedThumbnailClassName
          }
          resolvedThumbnailClassName={resolvedThumbnailClassName}
          showThumbnailLabels={showThumbnailLabels}
          thumbnailSizePx={thumbnailSizePx}
          isThumbnailDraggable={isThumbnailDraggable}
        />
      ))}
    </article>
  );
}

export function useMediaCarouselSelectionState<T>({
  hasExternalSelection,
  items,
  onSelect,
  selectedId,
}: {
  hasExternalSelection: boolean;
  items: Array<MediaCarouselItem<T>>;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}): Omit<
  MediaCarouselSelectionState<T>,
  "handleKeyDown" | "handleNext" | "handlePrev"
> & {
  selectedIndex: number;
} {
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
  const selectionSync = useMemo(
    () =>
      resolveMediaCarouselSelectionSync({
        hasExternalSelection,
        items,
        resolvedSelectedId,
      }),
    [hasExternalSelection, items, resolvedSelectedId],
  );

  useEffect(() => {
    if (selectionSync.nextInternalSelectedId !== undefined) {
      setInternalSelectedId(selectionSync.nextInternalSelectedId);
    }
    if (selectionSync.nextSelectedIdToNotify) {
      onSelect?.(selectionSync.nextSelectedIdToNotify);
    }
  }, [onSelect, selectionSync]);

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

  return {
    handleSelect,
    selectedIndex,
    selectedItem,
  };
}
