import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { Heading, HStack, IconButton, Stack } from "@chakra-ui/react";
import { VscSave } from "react-icons/vsc";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "thunks/kwargs";

export default function KwargsControls({ sectionId, objInfoId }) {
  function onClickAddKwarg() {
    addKwarg({ sectionId, objInfoId });
  }
  function onClickDeleteKwarg() {
    deleteKwarg({ sectionId, objInfoId, deleteLast: true });
  }
  function onClickSaveAsCollection() {
    saveKwargsAsCollection({ sectionId, objInfoId });
  }

  return (
    <Stack>
      <HStack pt="1rem" pl=".75rem">
        <Heading
          as="h2"
          color="gray.400"
          size="sm"
          fontWeight="700"
          // pr="0.1rem"
        >
          kwargs
        </Heading>
        <KwargsButton
          icon={<MinusIcon w={2} />}
          type="minus"
          onClick={onClickDeleteKwarg}
        />
        <KwargsButton
          icon={<AddIcon w={2} />}
          onClick={onClickAddKwarg}
          type="add"
        />
        <SaveAsCollection onClick={onClickSaveAsCollection} />
      </HStack>
    </Stack>
  );
}

function KwargsButton({ icon, onClick, type }) {
  return (
    <IconButton
      icon={icon}
      size="xs"
      variant="ghost"
      borderRadius="full"
      onClick={onClick}
      className="nodrag"
      position="inherit"
      ml="0.1rem !important"
      aria-label={type === "add" ? "Add Kwarg" : "Delete Kwarg"}
    />
  );
}

function SaveAsCollection({ onClick }) {
  return (
    <IconButton
      icon={<VscSave />}
      size="xs"
      variant="ghost"
      borderRadius="full"
      onClick={onClick}
      className="nodrag"
      position="inherit"
      ml="0.1rem !important"
    />
  );
}
