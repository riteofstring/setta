import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { FileList } from "./FileListing";

export function FileExplorer({
  files,
  selected,
  onSelectedChange,
  title,
  onFileDoubleClick,
}: {
  files: Array<{ id: string; name: string }>;
  selected: string | null;
  title: string;
  onSelectedChange: (newValue: string | null) => void;
  onFileDoubleClick: (newValue: string) => void;
}) {
  return (
    <>
      <Dialog.Title className=" mb-4 font-bold uppercase tracking-widest text-setta-400">
        {title}
      </Dialog.Title>

      <div className="mb-2 flex justify-between border-b border-solid border-setta-200 pb-2">
        <button className="nodrag inline-flex cursor-pointer items-center rounded-md text-xs text-setta-400 ring-0 hover:text-setta-900 focus-visible:ring-2 dark:hover:text-setta-200">
          Name
        </button>
      </div>
      <div className="overflow-scroll">
        <RadioGroup.Root
          // @ts-expect-error It doesn't like null, but it works.
          value={selected}
          onValueChange={onSelectedChange}
          asChild
        >
          {/* @ts-expect-error ref gets passed in by RadioGroup.Root I think */}
          <FileList
            files={files}
            onClick={onSelectedChange}
            onFileDoubleClick={onFileDoubleClick}
          />
        </RadioGroup.Root>
      </div>
    </>
  );
}
