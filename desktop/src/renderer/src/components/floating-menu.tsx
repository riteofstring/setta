import type { AriaRole, CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "../lib/utils";

type FloatingMenuAlign = "left" | "right";
type FloatingMenuPlacement = "bottom" | "left" | "right" | "top";

interface FloatingMenuProps {
  align?: FloatingMenuAlign;
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  gap?: number;
  id?: string;
  matchAnchorWidth?: boolean;
  menuRef?: RefObject<HTMLDivElement | null>;
  open: boolean;
  placement?: FloatingMenuPlacement;
  role?: AriaRole;
  viewportInset?: number;
}

interface FloatingMenuPosition {
  left: number;
  top: number;
  width?: number;
}

const floatingMenuZIndex = 1000;

export function FloatingMenu({
  align = "left",
  anchorRef,
  ariaLabel,
  children,
  className,
  gap = 6,
  id,
  matchAnchorWidth = false,
  menuRef,
  open,
  placement = "bottom",
  role,
  viewportInset = 8,
}: FloatingMenuProps) {
  const internalMenuRef = useRef<HTMLDivElement | null>(null);
  const resolvedMenuRef = menuRef ?? internalMenuRef;
  const [position, setPosition] = useState<FloatingMenuPosition | null>(null);
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = resolvedMenuRef.current;
    const view = anchor?.ownerDocument.defaultView;
    if (!anchor || !menu || !view) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    setPosition(
      floatingMenuPosition({
        align,
        anchorRect,
        gap,
        matchAnchorWidth,
        menuRect,
        placement,
        viewportHeight: view.innerHeight,
        viewportInset,
        viewportWidth: view.innerWidth,
      }),
    );
  }, [align, anchorRef, gap, matchAnchorWidth, placement, resolvedMenuRef, viewportInset]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const anchor = anchorRef.current;
    const view = anchor?.ownerDocument.defaultView ?? window;
    const reposition = () => updatePosition();
    view.addEventListener("resize", reposition);
    view.addEventListener("scroll", reposition, true);
    return () => {
      view.removeEventListener("resize", reposition);
      view.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef, open, updatePosition]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const menu = resolvedMenuRef.current;
    if (!open || !anchor || !menu || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => updatePosition());
    observer.observe(anchor);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [anchorRef, open, resolvedMenuRef, updatePosition]);

  if (!open) {
    return null;
  }

  const menu = (
    <div
      aria-label={ariaLabel}
      className={cn("app-no-drag", className)}
      id={id}
      ref={resolvedMenuRef}
      role={role}
      style={floatingMenuStyle(position)}
    >
      {children}
    </div>
  );

  if (typeof document === "undefined") {
    return (
      <div aria-label={ariaLabel} className={cn("app-no-drag", className)} id={id} role={role}>
        {children}
      </div>
    );
  }
  return createPortal(menu, document.body);
}

function floatingMenuStyle(position: FloatingMenuPosition | null): CSSProperties {
  return {
    left: position?.left ?? 0,
    position: "fixed",
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
    width: position?.width,
    zIndex: floatingMenuZIndex,
  };
}

function floatingMenuPosition({
  align,
  anchorRect,
  gap,
  matchAnchorWidth,
  menuRect,
  placement,
  viewportHeight,
  viewportInset,
  viewportWidth,
}: {
  align: FloatingMenuAlign;
  anchorRect: DOMRect;
  gap: number;
  matchAnchorWidth: boolean;
  menuRect: DOMRect;
  placement: FloatingMenuPlacement;
  viewportHeight: number;
  viewportInset: number;
  viewportWidth: number;
}) {
  const width = matchAnchorWidth ? anchorRect.width : menuRect.width;
  if (placement === "right" || placement === "left") {
    return floatingMenuSidePosition({
      anchorRect,
      gap,
      matchAnchorWidth,
      menuRect,
      placement,
      viewportHeight,
      viewportInset,
      viewportWidth,
      width,
    });
  }
  return floatingMenuVerticalPosition({
    align,
    anchorRect,
    gap,
    matchAnchorWidth,
    menuRect,
    placement,
    viewportHeight,
    viewportInset,
    viewportWidth,
    width,
  });
}

function floatingMenuSidePosition({
  anchorRect,
  gap,
  matchAnchorWidth,
  menuRect,
  placement,
  viewportHeight,
  viewportInset,
  viewportWidth,
  width,
}: {
  anchorRect: DOMRect;
  gap: number;
  matchAnchorWidth: boolean;
  menuRect: DOMRect;
  placement: "left" | "right";
  viewportHeight: number;
  viewportInset: number;
  viewportWidth: number;
  width: number;
}) {
  const placementRight = placement === "right";
  const preferredLeft = placementRight ? anchorRect.right + gap : anchorRect.left - width - gap;
  const alternateLeft = placementRight ? anchorRect.left - width - gap : anchorRect.right + gap;
  const leftFits = placementRight
    ? preferredLeft + width <= viewportWidth - viewportInset
    : preferredLeft >= viewportInset;
  return {
    left: clamp(
      leftFits ? preferredLeft : alternateLeft,
      viewportInset,
      viewportWidth - width - viewportInset,
    ),
    top: clamp(anchorRect.top, viewportInset, viewportHeight - menuRect.height - viewportInset),
    width: matchAnchorWidth ? width : undefined,
  };
}

function floatingMenuVerticalPosition({
  align,
  anchorRect,
  gap,
  matchAnchorWidth,
  menuRect,
  placement,
  viewportHeight,
  viewportInset,
  viewportWidth,
  width,
}: {
  align: FloatingMenuAlign;
  anchorRect: DOMRect;
  gap: number;
  matchAnchorWidth: boolean;
  menuRect: DOMRect;
  placement: "bottom" | "top";
  viewportHeight: number;
  viewportInset: number;
  viewportWidth: number;
  width: number;
}) {
  const unclampedLeft = align === "right" ? anchorRect.right - width : anchorRect.left;
  const preferredTop =
    placement === "top" ? anchorRect.top - menuRect.height - gap : anchorRect.bottom + gap;
  const alternateTop =
    placement === "top" ? anchorRect.bottom + gap : anchorRect.top - menuRect.height - gap;
  const topFits =
    placement === "top"
      ? preferredTop >= viewportInset
      : preferredTop + menuRect.height <= viewportHeight - viewportInset;
  return {
    left: clamp(unclampedLeft, viewportInset, viewportWidth - width - viewportInset),
    top: clamp(
      topFits ? preferredTop : alternateTop,
      viewportInset,
      viewportHeight - menuRect.height - viewportInset,
    ),
    width: matchAnchorWidth ? width : undefined,
  };
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
