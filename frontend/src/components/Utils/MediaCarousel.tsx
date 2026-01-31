import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiFileText } from "react-icons/fi";
import { IoImageOutline } from "react-icons/io5";
import { useIsScrollable } from "state/hooks/sectionSizes";

export type MediaCarouselItem<T = unknown> = {
  id: string;
  label: string;
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
  renderThumbnailOverlay?: (item: MediaCarouselItem<T>) => ReactNode;
  showThumbnailLabels?: boolean;
  thumbnailSize?: number;
  showNavButtons?: boolean;
  containerClassName?: string;
  previewClassName?: string;
  thumbnailRowClassName?: string;
  thumbnailClassName?: string;
  selectedThumbnailClassName?: string;
  footer?: ReactNode;
};

const DEFAULT_THUMBNAIL_SIZE = 96;

export function MediaCarousel<T>({
  items,
  selectedId,
  onSelect,
  renderPreview,
  renderThumbnailOverlay,
  showThumbnailLabels = true,
  thumbnailSize = DEFAULT_THUMBNAIL_SIZE,
  showNavButtons = false,
  containerClassName,
  previewClassName,
  thumbnailRowClassName,
  thumbnailClassName,
  selectedThumbnailClassName,
  footer,
}: MediaCarouselProps<T>) {
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
  const { ref, isScrollable } = useIsScrollable();

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

  const resolvedPreview = selectedItem
    ? renderPreview?.(selectedItem)
    : null;
  const previewContent =
    resolvedPreview ?? renderDefaultPreview(selectedItem);

  const previewContainerClasses = [
    "relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-lg",
    "bg-transparent dark:bg-setta-860",
    previewClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const wrapperClasses = [
    "flex min-h-0 flex-1 flex-col gap-2",
    containerClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const thumbnailRowClasses = [
    "flex gap-2 overflow-x-scroll pb-4 pt-[4px]",
    isScrollable ? "nowheel" : "",
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

  function renderDefaultPreview(
    item: MediaCarouselItem<T> | null,
  ): ReactNode {
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
      className={wrapperClasses}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <section className={previewContainerClasses}>
        {showNavButtons && items.length > 1 ? (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
          >
            <FiChevronLeft />
          </button>
        ) : null}
        {previewContent}
        {showNavButtons && items.length > 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-setta-500 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-setta-800/80 dark:text-setta-200"
          >
            <FiChevronRight />
          </button>
        ) : null}
      </section>
      {footer ? footer : null}

      <article ref={ref} className={thumbnailRowClasses}>
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
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect(item.id);
                }
              }}
              className={`group/thumbnail flex cursor-pointer flex-col items-center gap-1 ${
                isSelected ? "scale-105" : ""
              }`}
              style={{ width: `${thumbnailSize}px` }}
            >
              <div
                className={thumbnailContainerClassName}
                style={{ width: `${thumbnailSize}px`, height: `${thumbnailSize}px` }}
              >
                {item.thumbnailUrl ? (
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
                )}
                {renderThumbnailOverlay ? renderThumbnailOverlay(item) : null}
              </div>
              {showThumbnailLabels ? (
                <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
                  {item.label}
                </p>
              ) : null}
            </div>
          );
        })}
      </article>
    </div>
  );
}
