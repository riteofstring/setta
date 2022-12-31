import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { useRef } from "react";
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
      <Dialog.Title className="font-bold uppercase tracking-widest text-gray-500 mb-2">
        {modalType === "Load" && "Load Project"}
        {modalType === "Save As" && "Save Project As"}
      </Dialog.Title>
      <div className="flex justify-between p-0 mb-3 pb-1 border-b border-gray-200">
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
    <div className="flex flex-grow ml-6">
      <RadioGroup.Item
        value={id}
        ref={itemRef}
        onClick={_onClick}
        className="group/radioitem flex-grow rounded-md "
      >
        <FileListItem isProject={false} name={name} />
      </RadioGroup.Item>
    </div>
  );
}
