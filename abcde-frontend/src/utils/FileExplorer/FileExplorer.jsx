import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useState } from "react";
import { Button } from "../../utils/atoms/buttons/Button";
import { FileList } from "./FileListing";

export function FileExplorer({ files, selected, setSelected, title }) {
  const [currFiles, setCurrFiles] = useState(files);
  function onFolderDoubleClick(id) {
    const newCurrFiles = getFolderContents({ id, currFiles });
    setCurrFiles(newCurrFiles);
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

      <RadioGroup.Root value={selected} onValueChange={setSelected} asChild>
        <FileList
          files={currFiles}
          onClick={setSelected}
          onFolderDoubleClick={onFolderDoubleClick}
        />
      </RadioGroup.Root>
    </>
  );
}

function getFolderContents({ id, currFiles }) {
  const idx = currFiles.findIndex((f) => f.id == id);
  const depthAtIdx = currFiles[idx].depth;
  const contents = [];
  for (const f of currFiles.slice(idx + 1)) {
    if (f.depth > depthAtIdx) {
      contents.push({ ...f, depth: f.depth - 1 });
    } else {
      break;
    }
  }
  return contents;
}
