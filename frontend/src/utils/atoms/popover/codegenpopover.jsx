import * as Popover from "@radix-ui/react-popover";
import { HiOutlineDuplicate } from "react-icons/hi";
import { StandardPopover } from "./standardpopover";

export function CodeGenPopover({
  trigger,
  body,
  header,
  closeButton,
  footer,
  open,
  onOpenChange,
}) {
  return (
    <StandardPopover
      trigger={trigger}
      contentClasses="bg-slate-200 dark:bg-runcoder-700 p-3 rounded-lg shadow-md drop-shadow-md text-sm cursor-pointer"
      popoverContent={<Content header={header} body={body} footer={footer} />}
      open={open}
      closeButton={closeButton}
      onOpenChange={onOpenChange}
    />
  );
}

function Content({ header, body, footer }) {
  return (
    <>
      <p className="mb-2 text-xs font-bold uppercase text-runcoder-600 dark:text-runcoder-200">
        {header}
      </p>
      <div className="mt-1 flex flex-row items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 dark:bg-runcoder-900">
        <code className="font-code text-white  ">{body}</code>
        <Popover.Close>
          <HiOutlineDuplicate className="h-5 w-5 text-white" />
        </Popover.Close>
      </div>
      <p>{footer}</p>
    </>
  );
}
