import * as Popover from "@radix-ui/react-popover";

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
}: {
  trigger: React.ReactElement;
  contentClasses?: string;
  contentProps?: Omit<Popover.PopoverContentProps, "children" | "className">;
  children?: React.ReactNode;
  close?: boolean;
  closeClasses?: string;
  arrowClasses?: string;
  portalContainerId?: string;
} & (
  | { open?: undefined; onOpenChange?: undefined }
  | { open: boolean; onOpenChange: (newOpen: boolean) => void }
)) {
  // TODO: show a close button if closeButton is true

  const portalContainer =
    portalContainerId && typeof document !== "undefined"
      ? document.getElementById(portalContainerId)
      : null;
  const rootProps: Popover.PopoverProps = open ? { open, onOpenChange } : {};
  return (
    <Popover.Root {...rootProps}>
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
