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
  },
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
      className={`flex flex-grow cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-setta-100 focus-visible:ring-1 dark:text-setta-100 dark:hover:bg-setta-900 dark:hover:text-white`}
    >
      <span className="w-4">
        <RadioGroup.Indicator>
          <HiCheckCircle className="checkicon cursor-pointer text-green-500" />
        </RadioGroup.Indicator>
      </span>
      <div className="flex flex-grow justify-between">
        <label className="cursor-pointer">{name}</label>
        {/* <div className="text-xs text-setta-400">2023/01/01</div> */}
      </div>
    </RadioGroup.Item>
  ) : (
    <div
      style={{ marginLeft: `${1.5 * depth}rem` }}
      className="flex flex-grow select-none items-center gap-2 rounded-md px-2 py-1"
      onDoubleClick={() => onFolderDoubleClick(id)}
    >
      <HiOutlineFolder className="text-setta-400 group-hover:text-setta-800 dark:text-setta-200" />
      <div className="flex flex-grow justify-between ">
        <div className="flex gap-2">
          <h4 className="text-xs font-bold tracking-wider text-setta-500 hover:text-setta-900 dark:text-setta-300 dark:hover:text-setta-200">
            {name}
          </h4>
        </div>
      </div>
    </div>
  );
}
