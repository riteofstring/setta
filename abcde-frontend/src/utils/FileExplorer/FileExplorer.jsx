import { Button, Flex, Spacer, useRadioGroup } from "@chakra-ui/react";
import _ from "lodash";

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
      <Flex
        py={0}
        px={0}
        mb="0.75rem"
        borderBottom="1px"
        borderColor="gray.200"
      >
        <Button size="xs" variant="ghost">
          Name
        </Button>
        <Spacer />
        <Button size="xs" variant="ghost">
          Date
        </Button>
      </Flex>
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
