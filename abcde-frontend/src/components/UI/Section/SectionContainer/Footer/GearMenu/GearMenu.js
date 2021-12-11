import { SettingsIcon } from "@chakra-ui/icons";
import {
  GridItem,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
} from "@chakra-ui/react";

// import { MenuContext } from "../SectionFooter";
// import ModalContext from "../../../../../../utils/ModalContainer/ModalContext";
// import { useContext } from "react";

export default function GearMenu({ setSelectedMenuItem, onOpen }) {
  function setOpen(e) {
    onOpen();
    setSelectedMenuItem(e);
  }
  return (
    <GridItem
      justifySelf="flex-end"
      colStart="1"
      colEnd="2"
      rowStart="1"
      rowEnd="2"
      position="relative"
    >
      <Menu>
        <MenuButton
          as={IconButton}
          aria-label="Options"
          icon={<SettingsIcon />}
          size="sm"
          color="gray.500"
          variant="ghost"
        />
        <MenuList>
          <MenuItem onClick={() => setOpen("UI_TYPES")}>UI Types</MenuItem>
          <MenuItem onClick={() => setOpen("PARAM_SWEEP")}>
            Parameter Sweeps
          </MenuItem>

          <MenuDivider />
          <MenuItem onClick={() => setOpen("LOAD")}>Load Section</MenuItem>
          <MenuItem onClick={() => setOpen("SAVE")}>Save Section</MenuItem>
        </MenuList>
      </Menu>
    </GridItem>
  );
}
