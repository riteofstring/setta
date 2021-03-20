import { HStack, useRadioGroup, Flex, Button, Spacer } from "@chakra-ui/react";
import ListItem from "./ListItem";
import FileListContainer from "./FileListContainer";

export default function FileExplorer({
  folderNames,
  folderAndFileInfo,
  onFolderSelect,
  onFileSelect,
  selectedFolder,
  selectedFile,
}) {

  const {
    getRootProps: getRootPropsFolder,
    getRadioProps: getRadioPropsFolder,
  } = useRadioGroup({
    name: "folderSelection",
    defaultValue: selectedFolder,
    value: selectedFolder,
    onChange: onFolderSelect,
  });

  const {
    getRootProps: getRootPropsFile,
    getRadioProps: getRadioPropsFile,
  } = useRadioGroup({
    name: "fileSelection",
    value: selectedFile[selectedFolder],
    onChange: onFileSelect,
  });

  return (
    <HStack h="40vh">
      <FileListContainer width="40%" group={getRootPropsFolder()}>
        {folderNames.map((value) => {
          const radio = getRadioPropsFolder({ value });

          return (
            <ListItem
              key={`folderitem-${value}`}
              {...radio}
              isFolder={true}
              isSelected={value === selectedFolder}
            >
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
        {folderAndFileInfo[selectedFolder]
          ? folderAndFileInfo[selectedFolder].map((value) => {
              const radio = getRadioPropsFile({
                value,
              });
              return (
                <ListItem key={`fileitem-${value}`} {...radio} isFolder={false}>
                  {value}
                </ListItem>
              );
            })
          : null}
      </FileListContainer>
    </HStack>
  );
}
