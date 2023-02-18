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
      contentClasses="bg-slate-200 p-3 rounded-lg shadow-md drop-shadow-md text-sm cursor-pointer"
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
      <h3 className="mb-2 text-xs font-bold uppercase text-slate-600">
        {header}
      </h3>
      <div className="mt-1 flex flex-row items-center gap-2 rounded-lg bg-slate-700 px-3 py-2">
        <code className="font-code text-white  ">{body}</code>
        <HiOutlineDuplicate className="h-5 w-5 text-white" />
      </div>
      <p>{footer}</p>
    </>
  );
}
