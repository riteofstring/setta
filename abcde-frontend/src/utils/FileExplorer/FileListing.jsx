import * as RadioGroup from "@radix-ui/react-radio-group";
import { useRef } from "react";
import { HiCheckCircle, HiOutlineFolder } from "react-icons/hi";

export function FolderAndFiles({ folder, onClick }) {
  const foldername = folder.name;
  return (
    <div value={foldername} className="flex flex-col">
      <Folder name={foldername} />
      <FileList
        foldername={foldername}
        files={folder.files}
        onClick={onClick}
      />
    </div>
  );
}

function Folder({ name }) {
  return (
    <div className="flex flex-grow select-none items-center gap-2 rounded-md py-1 px-2">
      <HiOutlineFolder className="text-slate-400 group-hover:text-slate-800" />

      <div className="flex flex-grow justify-between bg-white">
        <div className="flex gap-2">
          <h4 className="text-xs font-bold tracking-wider text-slate-500 hover:text-slate-900">
            {name}
          </h4>
        </div>
      </div>
    </div>
  );
}

function FileList({ foldername, files, onClick }) {
  //
  return (
    <div className="flex flex-grow flex-col ">
      {files.map((x, idx) => {
        const id = JSON.stringify({
          foldername,
          filename: x,
        });
        return (
          <File id={id} name={x} onClick={onClick} key={`File ${idx} ${x}`} />
        );
      })}
    </div>
  );
}

function File({ id, name, onClick }) {
  const itemRef = useRef(null);

  function _onClick() {
    const isChecked =
      itemRef.current?.attributes["data-state"]?.value === "checked";
    if (isChecked) {
      onClick(JSON.stringify({ foldername: null, filename: null }));
    }
  }

  return (
    <RadioGroup.Item
      value={id}
      ref={itemRef}
      onClick={_onClick}
      className="ml-6 flex flex-grow cursor-pointer items-center gap-2 rounded-lg py-1 px-2 text-sm hover:bg-slate-100 focus-visible:ring-1"
    >
      <span className="w-4">
        <RadioGroup.Indicator>
          <HiCheckCircle className="checkicon cursor-pointer text-green-500" />
        </RadioGroup.Indicator>
      </span>
      <div className="flex flex-grow justify-between">
        <label className="cursor-pointer">{name}</label>
        <div className="text-xs text-slate-400">2023/01/01</div>
      </div>
    </RadioGroup.Item>
  );
}
