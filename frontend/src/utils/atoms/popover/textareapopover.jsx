import * as Popover from "@radix-ui/react-popover";
import { BiSave } from "react-icons/bi";
import { Button } from "../buttons/Button";
import { StandardPopover } from "./standardpopover";

export function TextAreaPopover({
  trigger,
  header,
  closeButton,
  footer,
  open,
  onOpenChange,
  onChange,
  onClick,
  value,
}) {
  return (
    <StandardPopover
      trigger={trigger}
      contentClasses="bg-setta-200 dark:bg-setta-700 p-3 rounded-lg shadow-md drop-shadow-md text-sm"
      popoverContent={
        <Content
          header={header}
          footer={footer}
          onChange={onChange}
          onClick={onClick}
          value={value}
        />
      }
      open={open}
      closeButton={closeButton}
      onOpenChange={onOpenChange}
    />
  );
}

function Content({ header, footer, onChange, onClick, value }) {
  return (
    <>
      {header && (
        <p className="bg:text-setta-100 mb-2 text-xs font-bold uppercase text-setta-600">
          {header}
        </p>
      )}
      <div className="mt-1 flex flex-col gap-1">
        <Body onChange={onChange} onClick={onClick} value={value} />
      </div>
      {footer && <p>{footer}</p>}
    </>
  );
}

function Body({ onChange, onClick, value }) {
  return (
    <>
      <textarea
        className="cursor-auto overflow-y-auto overflow-x-hidden rounded-md px-3 py-2 focus-visible:outline focus-visible:outline-blue-500"
        placeholder="Description"
        rows="4"
        cols="50"
        value={value}
        onChange={onChange}
      />
      <div className="mt-2 flex gap-1 self-end">
        <Popover.Close asChild>
          <Button
            twClasses="gap-1 border border-solid border-white dark:border-setta-900 py-1 px-3 rounded-full hover:bg-white dark:hover:bg-setta-800 text-xs transition-all"
            onClick={onClick}
          >
            Save <BiSave className="text-setta-600 dark:text-setta-300" />
          </Button>
        </Popover.Close>
      </div>
    </>
  );
}
