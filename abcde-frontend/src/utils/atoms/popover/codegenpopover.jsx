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
      contentClasses="bg-gray-200 p-3 rounded-lg shadow-md drop-shadow-md text-sm cursor-pointer"
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
      <h3 className="font-bold uppercase text-xs text-gray-600">{header}</h3>
      <div className="flex flex-row items-center gap-2 px-3 py-2 mt-1 rounded-md bg-gray-700">
        <code className="font-code text-white  ">{body}</code>
        <HiOutlineDuplicate className="text-white w-5 h-5" />
      </div>
      <p>{footer}</p>
    </>
  );
}
