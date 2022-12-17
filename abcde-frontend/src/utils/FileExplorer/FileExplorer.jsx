import { useRadioGroup } from "@chakra-ui/react";
import _ from "lodash";
import Button from "../../utils/atoms/buttons/Button";

import FileListContainer from "./FileListContainer";
import { FileListItem, SelectableFileListItem } from "./FileListItem";

export default function FileExplorer({ files, selected, setSelected }) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "fileExplorer",
    value: JSON.stringify(selected),
    onChange,
  });

  const radioGroup = getRootProps();

  return (
    <FileListContainer radioGroup={radioGroup}>
      <div className="flex justify-between p-0 mb-3 border-b border-gray-200">
        <Button>Name</Button>
        <Button>Date</Button>
      </div>
      {_.map(files, (x, idx) => (
        <ProjectListing
          project={x}
          key={`File ${idx}`}
          getRadioProps={getRadioProps}
        />
      ))}
    </FileListContainer>
  );
}

function ProjectListing({ project, getRadioProps }) {
  return (
    <>
      <FileListItem isProject={true}>{project.name}</FileListItem>
      {project.configs.map((x, idx) => (
        <div style={{ marginLeft: "20px" }} key={`File config ${idx}`}>
          <SelectableFileListItem
            isProject={false}
            radioProps={getRadioProps({
              value: JSON.stringify({
                id: project.id,
                configId: x.id,
              }),
            })}
          >
            {x.name}
          </SelectableFileListItem>
        </div>
      ))}
    </>
  );
}
