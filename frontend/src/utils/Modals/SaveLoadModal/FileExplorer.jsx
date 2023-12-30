import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Button } from "../../atoms/buttons/Button";
import { FileList } from "./FileListing";

export function FileExplorer({
  files,
  selected,
  onSelectedChange,
  title,
  onFolderDoubleClick,
  onFileDoubleClick,
  breadCrumb,
  onBreadCrumbClick,
}) {
  return (
    <>
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-slate-400">
        {title}
      </Dialog.Title>

      {breadCrumb.map((f, idx) => (
        <Button
          key={`breadCrumb-${idx}`}
          twClasses="mr-10"
          onClick={() => onBreadCrumbClick(idx)}
        >
          {f.name}
        </Button>
      ))}

      <div className="mx-3 mb-2 flex justify-between border-b border-solid border-slate-200 pb-2">
        <Button twClasses="text-xs text-slate-400 hover:text-slate-900 dark:hover:text-runcoder-200 rounded-md ring-0">
          Name
        </Button>
        <Button twClasses="text-xs text-slate-400 dark:hover:text-runcoder-200 hover:text-slate-900 rounded-md ring-0">
          Last Modified
        </Button>
      </div>
      <div className="overflow-scroll">
        <RadioGroup.Root
          value={selected}
          onValueChange={onSelectedChange}
          asChild
        >
          <FileList
            files={files}
            onClick={onSelectedChange}
            onFolderDoubleClick={onFolderDoubleClick}
            onFileDoubleClick={onFileDoubleClick}
          />
        </RadioGroup.Root>{" "}
      </div>
    </>
  );
}
