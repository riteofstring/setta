import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";

import {
  NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import { useIsScrollable } from "../useIsScrollable";

export type WorkspaceCarouselItem = Readonly<{
  content: ReactNode;
  id: string;
  label: string;
  thumbnail?: ReactNode;
}>;

export type WorkspaceCarouselProps = Readonly<{
  activeItemId: string | null;
  ariaLabel: string;
  className?: string;
  emptyState?: ReactNode;
  items: ReadonlyArray<WorkspaceCarouselItem>;
  onActiveItemChange: (itemId: string) => void;
}>;

function navigationIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, currentIndex - 1);
    case "ArrowRight":
      return Math.min(itemCount - 1, currentIndex + 1);
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}

export function WorkspaceCarousel({
  activeItemId,
  ariaLabel,
  className = "",
  emptyState = null,
  items,
  onActiveItemChange,
}: WorkspaceCarouselProps) {
  const thumbnailRefs = useRef(new Map<string, HTMLButtonElement>());
  const { ref: trackRef, isScrollable } = useIsScrollable();
  const requestedIndex = items.findIndex((item) => item.id === activeItemId);
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const activeItem = items[activeIndex];
  const resolvedActiveItemId = activeItem?.id ?? null;

  useEffect(() => {
    if (resolvedActiveItemId === null) {
      return;
    }
    thumbnailRefs.current.get(resolvedActiveItemId)?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [resolvedActiveItemId]);

  if (!activeItem) {
    return (
      <div
        aria-label={ariaLabel}
        aria-roledescription="carousel"
        className={`setta-workspace-carousel setta-workspace-carousel-empty ${className}`}
        role="region"
      >
        {emptyState}
      </div>
    );
  }
  const currentActiveItemId = activeItem.id;

  function activate(index: number): void {
    const item = items[index];
    if (item && item.id !== currentActiveItemId) {
      onActiveItemChange(item.id);
    }
  }

  function handleThumbnailKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    const nextIndex = navigationIndex(event.key, index, items.length);
    if (nextIndex === null || nextIndex === index) {
      return;
    }
    event.preventDefault();
    activate(nextIndex);
    const nextItem = items[nextIndex];
    if (nextItem) {
      thumbnailRefs.current.get(nextItem.id)?.focus();
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      className={`setta-workspace-carousel ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${className}`}
      role="region"
    >
      <div className="setta-workspace-carousel-stage">
        <button
          aria-label="Previous item"
          className="setta-workspace-carousel-control setta-workspace-carousel-previous"
          disabled={activeIndex === 0}
          onClick={() => activate(activeIndex - 1)}
          type="button"
        >
          <RiArrowLeftSLine aria-hidden="true" focusable="false" />
        </button>
        <div
          aria-label={`${activeItem.label}, ${String(activeIndex + 1)} of ${String(items.length)}`}
          aria-roledescription="slide"
          className="setta-workspace-carousel-slide"
          role="group"
        >
          {activeItem.content}
        </div>
        <button
          aria-label="Next item"
          className="setta-workspace-carousel-control setta-workspace-carousel-next"
          disabled={activeIndex === items.length - 1}
          onClick={() => activate(activeIndex + 1)}
          type="button"
        >
          <RiArrowRightSLine aria-hidden="true" focusable="false" />
        </button>
      </div>
      <div className="setta-workspace-carousel-navigation">
        <span aria-live="polite" className="setta-workspace-carousel-status">
          {`${String(activeIndex + 1)} / ${String(items.length)}`}
        </span>
        <div
          aria-label="Choose an item"
          className={`setta-workspace-carousel-track ${isScrollable ? NATIVE_HORIZONTAL_WHEEL_CLASS_NAME : ""}`}
          ref={trackRef}
        >
          {items.map((item, index) => (
            <button
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`Show ${item.label}`}
              className={`setta-workspace-carousel-thumbnail ${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION}`}
              key={item.id}
              onClick={() => activate(index)}
              onKeyDown={(event) => handleThumbnailKeyDown(event, index)}
              ref={(element) => {
                if (element) {
                  thumbnailRefs.current.set(item.id, element);
                } else {
                  thumbnailRefs.current.delete(item.id);
                }
              }}
              type="button"
            >
              {item.thumbnail === undefined ? null : (
                <span className="setta-workspace-carousel-thumbnail-media">
                  {item.thumbnail}
                </span>
              )}
              <span className="setta-workspace-carousel-thumbnail-label">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
