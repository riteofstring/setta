import TemplateButton from "./TemplateButton/TemplateButton";
import UiEditButton from "./UiEditButton/UiEditButton";
import SaveAsButton from "./SaveAsButton/SaveAsButton";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { IoDocumentTextOutline } from "react-icons/io5";
import { ChevronDownIcon, EditIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { Menu, MenuButton, MenuList, MenuItem, Button } from "@chakra-ui/react";
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
          <TemplateButton />

          <MenuItem icon={<VscSave />}>Save</MenuItem>
          <SaveAsButton />
        </MenuList>
      </Menu>
      <UiEditButton />
    </>
  );
}
