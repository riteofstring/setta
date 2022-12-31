import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { useRef } from "react";
import { HiCheckCircle } from "react-icons/hi";
import { Button } from "../../utils/atoms/buttons/Button";
import { FileListItem } from "./FileListItem";
import "./radioItem.css";

export default function FileExplorer({
  files,
  selected,
  setSelected,
  modalType,
}) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

  return (
    <div className="items-stretch overflow-y-auto">
      <Dialog.Title className="font-bold uppercase tracking-widest text-gray-400 mb-4">
        {modalType === "Load" && "Load Project"}
        {modalType === "Save As" && "Save Project As"}
      </Dialog.Title>
      <div className="flex justify-between mb-2">
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md">
          Name
        </Button>
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md">
          Date
        </Button>
      </div>
      <RadioGroup.Root
        value={JSON.stringify(selected)}
        onValueChange={onChange}
        className="flex flex-col p-1 rounded-lg border border-solid border-gray-100"
      >
        {_.map(files, (x, idx) => (
          <ProjectListing project={x} key={`File ${idx}`} onClick={onChange} />
        ))}
      </RadioGroup.Root>
    </div>
  );
}

function ProjectListing({ project, onClick }) {
  return (
    <>
      <FileListItem isProject={true} name={project.name} />
      <ConfigListings project={project} onClick={onClick} />
    </>
  );
}

function ConfigListings({ project, onClick }) {
  return project.configs.map((x, idx) => {
    const id = JSON.stringify({ id: project.id, configId: x.id });
    return (
      <ConfigListing
        id={id}
        name={x.name}
        key={`File config ${idx}`}
        onClick={onClick}
      />
    );
  });
}

function ConfigListing({ id, name, onClick }) {
  const itemRef = useRef();

  function _onClick() {
    const isChecked =
      itemRef?.current?.attributes["data-state"]?.value === "checked";
    if (isChecked) {
      onClick(JSON.stringify({ id: null, configId: null }));
    }
  }

  return (
    <RadioGroup.Item
      value={id}
      ref={itemRef}
      onClick={_onClick}
      className="flex flex-grow text-sm cursor-pointer ml-6 rounded-lg items-center gap-2 py-1 hover:bg-gray-100 px-2 focus-visible:ring-1"
    >
      <span className="w-4">
        <RadioGroup.Indicator>
          <HiCheckCircle className="checkicon cursor-pointer text-green-500" />
        </RadioGroup.Indicator>
      </span>
      <label className="cursor-pointer">{name}</label>
    </RadioGroup.Item>
  );
}
