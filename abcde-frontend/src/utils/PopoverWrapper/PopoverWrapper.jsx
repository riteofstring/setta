import * as Popover from "@radix-ui/react-popover";
import { HiOutlineDuplicate } from "react-icons/hi";

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
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <div style={{ zIndex: 100 }}>
        <Popover.Content className="bg-gray-200 p-3 rounded-lg shadow-md drop-shadow-md text-sm cursor-pointer">
          <Popover.Arrow className="[fill:rgb(229,_231,_235)]" />
          <h3 className="font-bold uppercase text-xs text-gray-600">
            {header}
          </h3>
          <div className="flex flex-row items-center gap-2 px-3 py-2 mt-1 rounded-md bg-gray-700">
            <code className="font-code text-white  ">{body}</code>
            <HiOutlineDuplicate className="text-white w-5 h-5" />
          </div>

          <p>{footer}</p>
        </Popover.Content>
      </div>
    </Popover.Root>
  );
}
