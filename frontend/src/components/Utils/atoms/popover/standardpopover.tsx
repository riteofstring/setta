import * as Popover from "@radix-ui/react-popover";
import { useEffect, useState } from "react";

import { useReactFlow } from "forks/xyflow/core/store";
import { CANVAS_FLOW_VIEWPORT_CHANGE_EVENT } from "utils/constants";

export function StandardPopover({
  trigger,
  contentClasses,
  contentProps,
  children,
  open,
  close = false,
  closeClasses,
  onOpenChange,
  arrowClasses,
  portalContainerId,
  repositionOnCanvasTransform = true,
}: {
  trigger: React.ReactElement;
  contentClasses?: string;
  contentProps?: Omit<Popover.PopoverContentProps, "children" | "className">;
  children?: React.ReactNode;
  close?: boolean;
  closeClasses?: string;
  arrowClasses?: string;
  portalContainerId?: string;
  open?: boolean;
  onOpenChange?: (newOpen: boolean) => void;
  repositionOnCanvasTransform?: boolean;
}) {
  // TODO: show a close button if closeButton is true

  const portalContainer =
    portalContainerId && typeof document !== "undefined"
      ? document.getElementById(portalContainerId)
      : null;
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;
  const resolvedContentProps = {
    updatePositionStrategy: "always" as const,
    ...contentProps,
  };

  useEffect(() => {
    if (!repositionOnCanvasTransform || !resolvedOpen) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    // Radix popovers portaled outside the canvas need an explicit reposition
    // signal while CanvasFlow mutates viewport refs between durable store syncs.
    let rafId: number | null = null;
    const scheduleReposition = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
      });
    };

    scheduleReposition();
    window.addEventListener(
      CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
      scheduleReposition,
    );
    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform,
      () => scheduleReposition(),
    );

    return () => {
      window.removeEventListener(
        CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
        scheduleReposition,
      );
      unsubscribe();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [repositionOnCanvasTransform, resolvedOpen]);

  return (
    <Popover.Root
      open={resolvedOpen}
      onOpenChange={(newOpen) => {
        if (open === undefined) {
          setInternalOpen(newOpen);
        }
        onOpenChange?.(newOpen);
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal container={portalContainer ?? undefined}>
        <Popover.Content className={contentClasses} {...resolvedContentProps}>
          {close && (
            <Popover.Close className={closeClasses}>{close}</Popover.Close>
          )}
          <Popover.Arrow
            className={
              arrowClasses
                ? arrowClasses
                : "[fill:rgb(229,_231,_235)] dark:[fill:rgb(51,_65,_85)]"
            }
          />
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
