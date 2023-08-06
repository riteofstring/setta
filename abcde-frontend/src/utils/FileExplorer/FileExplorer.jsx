import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Button } from "../../utils/atoms/buttons/Button";
import { FileList } from "./FileListing";

export function FileExplorer({
  files,
  selected,
  onSelectedChange,
  title,
  onFolderDoubleClick,
}) {
  return (
    <>
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-slate-400">
        {title}
      </Dialog.Title>

      <div className="mx-3 mb-2 flex justify-between border-b border-solid border-slate-200 pb-2">
        <Button twClasses="text-xs text-slate-400 hover:text-slate-900 rounded-md ring-0">
          Name
        </Button>
        <Button twClasses="text-xs text-slate-400 hover:text-slate-900 rounded-md ring-0">
          Last Modified
        </Button>
      </div>

      <RadioGroup.Root
        value={selected}
        onValueChange={onSelectedChange}
        asChild
      >
        <FileList
          files={files}
          onClick={onSelectedChange}
          onFolderDoubleClick={onFolderDoubleClick}
        />
      </RadioGroup.Root>
    </>
  );
}
