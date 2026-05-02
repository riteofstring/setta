import * as Popover from "@radix-ui/react-popover";
import { useEffect, useState } from "react";

import { useReactFlow } from "forks/xyflow/core/store";

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
  repositionOnCanvasTransform = false,
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

  useEffect(() => {
    if (!repositionOnCanvasTransform || !resolvedOpen) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    // ReactFlow pans and zooms via CSS transforms, so Radix popovers portaled
    // to document.body need an explicit reposition signal to stay attached.
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
    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform,
      () => scheduleReposition(),
    );

    return () => {
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
        <Popover.Content className={contentClasses} {...contentProps}>
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
