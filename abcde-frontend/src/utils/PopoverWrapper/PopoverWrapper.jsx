import * as Popover from "@radix-ui/react-popover";

export function PopoverWrapper({
  trigger,
  body,
  header,
  closeButton,
  footer,
  open,
  onOpenChange,
}) {
  // TODO: show a close button if closeButton is true

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <div style={{ zIndex: 100 }}>
        <Popover.Content>
          <Popover.Arrow />
          {header}
          {body}
          {footer}
        </Popover.Content>
      </div>
    </Popover.Root>
  );
}
