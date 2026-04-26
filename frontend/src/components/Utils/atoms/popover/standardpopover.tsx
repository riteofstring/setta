import * as Popover from "@radix-ui/react-popover";
import { subscribeToGpuViewportReposition } from "gpuFlow/viewportReposition";
import { useEffect, useState } from "react";

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
    return subscribeToGpuViewportReposition();
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
