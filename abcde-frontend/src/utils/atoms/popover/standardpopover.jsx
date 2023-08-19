import * as Popover from "@radix-ui/react-popover";

export function StandardPopover({
  trigger,
  contentClasses,
  popoverContent,
  open,
  close = false,
  closeClasses,
  onOpenChange,
}) {
  // TODO: show a close button if closeButton is true

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <div className="z-[100]">
        <Popover.Content className={contentClasses}>
          {close && (
            <Popover.Close className={closeClasses}>{close}</Popover.Close>
          )}
          <Popover.Arrow className="[fill:rgb(229,_231,_235)] dark:[fill:rgb(51,_65,_85)]" />
          {popoverContent}
        </Popover.Content>
      </div>
    </Popover.Root>
  );
}
