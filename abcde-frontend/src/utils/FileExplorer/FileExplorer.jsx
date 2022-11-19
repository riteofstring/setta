import { Button, Flex, Spacer } from "@chakra-ui/react";
import _ from "lodash";

import FileListContainer from "./FileListContainer";
import ListItem from "./ListItem";

export default function FileExplorer({ files }) {
  return (
    <FileListContainer>
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
        <ProjectListing project={x} key={`File ${idx}`} />
      ))}
    </FileListContainer>
  );
}

function ProjectListing({ project }) {
  return (
    <>
      <ListItem>{project.name}</ListItem>
      {project.configs.map((x, idx) => (
        <div style={{ marginLeft: "20px" }} key={`File config ${idx}`}>
          <ListItem>{x.name}</ListItem>
        </div>
      ))}
    </>
  );
}
