import { HStack, useRadioGroup, Flex, Button, Spacer } from "@chakra-ui/react";
// import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";
import ListItem from "./ListItem";
import FileListContainer from "./FileListContainer";

const tempStructure = {
  "folder one": ["one one", "one two", "one three"],
  "folder two": ["two one", "two two", "two three"],
  "folder three": ["three one", "three two", "three three"],
};

const tempFld = Object.keys(tempStructure);

export default function FileExplorer() {
  const [theFolder, setFolder] = useState(tempFld[0]);
  const [theFile, setFile] = useState({});

  const {
    getRootProps: getRootPropsFolder,
    getRadioProps: getRadioPropsFolder,
  } = useRadioGroup({
    name: "folderSelection",
    defaultValue: theFolder,
    value: theFolder,
    onChange: setFolder,
  });

  const {
    getRootProps: getRootPropsFile,
    getRadioProps: getRadioPropsFile,
  } = useRadioGroup({
    name: "fileSelection",
    value: theFile[theFolder],
    onChange: (value) => setFile({ ...theFile, [theFolder]: value }),
  });

  return (
    <HStack h="40vh">
      <FileListContainer width="40%" group={getRootPropsFolder()}>
        {tempFld.map((value) => {
          const radio = getRadioPropsFolder({ value });

          return (
            <ListItem key={`folderitem-${value}`} value={value} {...radio}>
              {value}
            </ListItem>
          );
        })}
      </FileListContainer>
      <FileListContainer width="60%" group={getRootPropsFile()}>
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
        {tempStructure[theFolder]
          ? tempStructure[theFolder].map((value) => {
              const radio = getRadioPropsFile({
                value,
              });
              return (
                <ListItem key={`fileitem-${value}`} value={value} {...radio}>
                  {value}
                </ListItem>
              );
            })
          : null}
      </FileListContainer>
    </HStack>
  );
}
