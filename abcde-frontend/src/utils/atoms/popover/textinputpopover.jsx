import { StandardPopover } from "./standardpopover";

export function TextInputPopover({
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
      <h3 className="text-xs font-bold uppercase text-slate-600">{header}</h3>
      <div className="mt-1 flex flex-row items-center gap-2 rounded-full border border-solid border-slate-300 bg-white px-3 py-2 text-slate-800 [&:has(input:focus-visible)]:border-blue-500">
        {body}
      </div>
      <p>{footer}</p>
    </>
  );
}
