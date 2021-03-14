import { HStack, useRadioGroup, Flex, Button, Spacer } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import ListItem from "./ListItem";
import FileListContainer from "./FileListContainer";

export default function FileExplorer({
  folderAndFileInfo,
  onFolderSelect,
  onFileSelect,
}) {
  const folderNames = Object.keys(folderAndFileInfo);

  const [theFolder, setFolder] = useState(null);
  const [theFile, setFile] = useState({});

  const _onFolderSelect = (value) => {
    setFolder(value);
    onFolderSelect(value);
    onFileSelect(theFile[value]);
  };

  const _onFileSelect = (value) => {
    setFile({ ...theFile, [theFolder]: value });
    onFileSelect(value);
  };

  useEffect(() => {
    if (!theFolder){
      setFolder(folderNames[0]);
    }
  }, [folderNames]);

  const {
    getRootProps: getRootPropsFolder,
    getRadioProps: getRadioPropsFolder,
  } = useRadioGroup({
    name: "folderSelection",
    defaultValue: theFolder,
    value: theFolder,
    onChange: _onFolderSelect,
  });

  const {
    getRootProps: getRootPropsFile,
    getRadioProps: getRadioPropsFile,
  } = useRadioGroup({
    name: "fileSelection",
    value: theFile[theFolder],
    onChange: _onFileSelect,
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
              isSelected={value === theFolder}
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
        {folderAndFileInfo[theFolder]
          ? folderAndFileInfo[theFolder].map((value) => {
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
