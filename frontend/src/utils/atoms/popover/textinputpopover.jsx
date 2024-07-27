import * as Popover from "@radix-ui/react-popover";
import { BiSave } from "react-icons/bi";
import { Button } from "../buttons/Button";
import { StandardPopover } from "./standardpopover";

export function TextInputPopover({
  trigger,
  header,
  closeButton,
  footer,
  open,
  onOpenChange,
  onChange,
  value,
  onClick,
}) {
  return (
    <StandardPopover
      trigger={trigger}
      contentClasses="bg-runcoder-200 p-3 rounded-lg shadow-md drop-shadow-md text-sm cursor-pointer"
      popoverContent={
        <Content
          header={header}
          footer={footer}
          onChange={onChange}
          value={value}
          onClick={onClick}
        />
      }
      open={open}
      closeButton={closeButton}
      onOpenChange={onOpenChange}
    />
  );
}

function Content({ header, footer, onChange, value, onClick }) {
  return (
    <>
      <p className="text-xs font-bold uppercase text-runcoder-600">{header}</p>
      <div className="mt-1 flex flex-row items-center gap-2 rounded-full border border-solid border-runcoder-300 bg-white px-3 py-2 text-runcoder-800 [&:has(input:focus-visible)]:border-blue-500">
        <Body onChange={onChange} value={value} onClick={onClick} />
      </div>
      <p>{footer}</p>
    </>
  );
}

function Body({ onChange, value, onClick }) {
  return (
    <>
      <input
        className="cursor-auto"
        placeholder="Preset Name"
        onChange={onChange}
        value={value}
      />

      <div className="flex gap-1">
        <Popover.Close asChild>
          <Button
            twClasses="gap-1 border border-solid border-white py-1 px-3 rounded-full hover:bg-white text-xs transition-all"
            onClick={onClick}
          >
            Save <BiSave className="text-runcoder-400" />
          </Button>
        </Popover.Close>
      </div>
    </>
  );
}
