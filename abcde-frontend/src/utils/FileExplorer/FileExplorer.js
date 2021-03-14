import { HStack, useRadioGroup, Flex, Button, Spacer } from "@chakra-ui/react";
// import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";
import ListItem from "./ListItem";
import FileListContainer from "./FileListContainer";

const tempStructure = {
  "folder one": {
    "one one": "one one",
    "one two": "one two",
    "one three": "one three",
  },
  "folder two": {
    "two one": "two one",
    "two two": "two two",
    "two three": "two three",
  },
  "folder three": {
    "three one": "three one",
    "three two": "three two",
    "three three": "three three",
  },
};

const tempFld = Object.keys(tempStructure);

export default function FileExplorer() {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
  });
  const group = getRootProps();

  const [value, setValue] = useState(tempFld[0]);

  return (
    <HStack h="40vh">
      <FileListContainer
        width="40%"
        group={group}
        onChange={setValue}
        value={value}
      >
        {tempFld.map((e) => {
          const radio = getRadioProps({ e });

          return (
            <ListItem key={`folderitem-${e}`} value={e} {...radio}>
              {e}
            </ListItem>
          );
        })}
      </FileListContainer>
      <FileListContainer width="60%" group={group}>
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
        {tempFld[value]
          ? tempFld[value].map((e) => {
              const radio = getRadioProps({ e });
              return (
                <ListItem key={`folderitem-${e}`} {...radio}>
                  {e}
                </ListItem>
              );
            })
          : null}
      </FileListContainer>
    </HStack>
  );
}
