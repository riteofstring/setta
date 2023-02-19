import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { Button } from "../../utils/atoms/buttons/Button";
import { FolderAndFiles } from "./FileListing";

export function FileExplorer({ folders, files, selected, setSelected, title }) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

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
        value={JSON.stringify(selected)}
        onValueChange={onChange}
        asChild
      >
        <div>
          {_.map(folders, (x, idx) => (
            <FolderAndFiles
              folder={x}
              key={`Folder ${idx}`}
              onClick={onChange}
            />
          ))}
        </div>
      </RadioGroup.Root>
    </>
  );
}
