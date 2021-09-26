import {
  Input,
  HStack,
  useRadioGroup,
  Flex,
  Button,
  Spacer,
} from "@chakra-ui/react";
import { useState } from "react";

import { createNewFolder } from "../../dbRequests/ui";
import FileListContainer from "./FileListContainer";
import ListItem from "./ListItem";

export default function FileExplorer({
  token,
  folderNames,
  foldersAndFiles,
  onFolderSelect,
  onFileSelect,
  selectedFolder,
  selectedFile,
  includeNewFolderButton,
  setFolderNames,
  setFoldersAndFiles,
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

  const { getRootProps: getRootPropsFile, getRadioProps: getRadioPropsFile } =
    useRadioGroup({
      name: "fileSelection",
      value: selectedFile[selectedFolder],
      onChange: onFileSelect,
    });

  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderField, setShowNewFolderField] = useState(false);

  const onExitNewFolderField = () => {
    if (newFolderName !== "" && folderNames.indexOf(newFolderName) === -1) {
      setFolderNames([...folderNames, newFolderName]);
      setFoldersAndFiles({ ...foldersAndFiles, [newFolderName]: [] });
      setShowNewFolderField(false);
      onFolderSelect(newFolderName);
      createNewFolder({ token, name: newFolderName });
    }
  };

  const onNewFolderButtonClick = () => {
    setShowNewFolderField(true);
  };

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
        {includeNewFolderButton && showNewFolderField && (
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Enter Folder Name"
            onBlur={onExitNewFolderField}
          />
        )}
        {includeNewFolderButton && (
          <Button onClick={onNewFolderButtonClick} size="s">
            New Folder
          </Button>
        )}
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
        {foldersAndFiles[selectedFolder]
          ? foldersAndFiles[selectedFolder].map((value) => {
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
