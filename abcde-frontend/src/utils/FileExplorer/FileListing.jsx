import * as RadioGroup from "@radix-ui/react-radio-group";
import React, { useRef } from "react";
import { HiCheckCircle, HiOutlineFolder } from "react-icons/hi";

export const FileList = React.forwardRef(
  ({ files, onClick, onFolderDoubleClick, onFileDoubleClick }, ref) => {
    return (
      <div className="flex flex-grow flex-col" ref={ref}>
        {files.map((x, idx) => {
          return (
            <File
              id={x.id}
              name={x.name}
              onClick={onClick}
              key={`File ${idx} ${x}`}
              depth={x.depth ?? 0}
              selectable={x.selectable ?? true}
              onFolderDoubleClick={onFolderDoubleClick}
              onFileDoubleClick={onFileDoubleClick}
            />
          );
        })}
      </div>
    );
  }
);

function File({
  id,
  name,
  onClick,
  depth,
  selectable,
  onFolderDoubleClick,
  onFileDoubleClick,
}) {
  const itemRef = useRef(null);

  function _onClick(e) {
    // single click
    if (e.detail === 1) {
      const isChecked =
        itemRef.current?.attributes["data-state"]?.value === "checked";
      if (isChecked) {
        onClick(null);
      }
    }
    // double click
    else if (e.detail === 2) {
      onFileDoubleClick(id);
    }
  }

  return selectable ? (
    <RadioGroup.Item
      value={id}
      ref={itemRef}
      onClick={_onClick}
      style={{ marginLeft: `${1.5 * depth}rem` }}
      className={`flex flex-grow cursor-pointer items-center gap-2 rounded-lg py-1 px-2 text-sm hover:bg-slate-100 focus-visible:ring-1 dark:hover:bg-runcoder-900`}
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
  ) : (
    <div
      style={{ marginLeft: `${1.5 * depth}rem` }}
      className="flex flex-grow select-none items-center gap-2 rounded-md py-1 px-2"
      onDoubleClick={() => onFolderDoubleClick(id)}
    >
      <HiOutlineFolder className="text-slate-400 group-hover:text-slate-800" />
      <div className="dark:bg-runcder-800 flex flex-grow justify-between bg-white">
        <div className="flex gap-2">
          <h4 className="text-xs font-bold tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-runcoder-200">
            {name}
          </h4>
        </div>
      </div>
    </div>
  );
}
