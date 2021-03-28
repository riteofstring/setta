import {
  GridItem,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
} from "@chakra-ui/react";

import { SettingsIcon } from "@chakra-ui/icons";
import { MenuContext } from "../SectionFooter";
import { useContext } from "react";

export default function GearMenu() {
  const { onOpen } = useContext(MenuContext);
  return (
    <GridItem
      justifySelf="flex-end"
      colStart="1"
      colEnd="2"
      rowStart="1"
      rowEnd="2"
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
          {/* <MenuItem onClick={onOpen}>Parameter Sweeps</MenuItem> */}
          <MenuItem onClick={onOpen}>Load Section</MenuItem>
          <MenuDivider />
          <MenuItem>Settings</MenuItem>
        </MenuList>
      </Menu>
    </GridItem>
  );
}
