import { VscSave } from "react-icons/vsc";
import { IoDocumentTextOutline } from "react-icons/io5";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { Menu, MenuButton, MenuList, MenuItem, Button } from "@chakra-ui/react";
import UiEditButton from "./UiEditButton/UiEditButton";
import SaveLoadButton from "../../../../../utils/FileExplorer/SaveLoadButton";
export default function PageNav() {
  return (
    <>
      <Menu>
        <MenuButton
          size="sm"
          variant="ghost"
          as={Button}
          // _hover={{ bg: "gray.400" }}
          // _expanded={{ bg: "blue.400" }}
          // _focus={{ boxShadow: "outline" }}
        >
          File <ChevronDownIcon />
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem icon={<IoDocumentTextOutline />}>New Project</MenuItem>
          <SaveLoadButton ButtonText="Load" />
          <MenuItem icon={<VscSave />}>Save</MenuItem>
          <SaveLoadButton ButtonText="Save As" />
        </MenuList>
      </Menu>
      {/* <UiEditButton /> */}
    </>
  );
}
