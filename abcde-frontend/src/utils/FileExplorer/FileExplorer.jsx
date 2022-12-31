import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { useRef } from "react";
import Button from "../../utils/atoms/buttons/Button";
import { FileListItem, SelectableFileListItem } from "./FileListItem";
import "./radioItem.css";

export default function FileExplorer({ files, selected, setSelected }) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

  return (
    <div className="h-[inherit] border border-gray-200 rounded-lg items-stretch px-6 py-4 overflow-y-auto">
      <div className="flex justify-between p-0 mb-3 border-b border-gray-200">
        <Button>Name</Button>
        <Button>Date</Button>
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
    <div style={{ marginLeft: "20px" }}>
      <RadioGroup.Item
        value={id}
        ref={itemRef}
        onClick={_onClick}
        className="RadioItem"
      >
        <SelectableFileListItem isProject={false} name={name} />
      </RadioGroup.Item>
    </div>
  );
}
