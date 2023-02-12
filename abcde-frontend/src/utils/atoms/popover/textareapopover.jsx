import { StandardPopover } from "./standardpopover";

export function TextAreaPopover({
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
      contentClasses="bg-slate-200 p-3 rounded-lg shadow-md drop-shadow-md text-sm"
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
      <div className="mt-1 flex flex-col gap-1">{body}</div>
      <p>{footer}</p>
    </>
  );
}
