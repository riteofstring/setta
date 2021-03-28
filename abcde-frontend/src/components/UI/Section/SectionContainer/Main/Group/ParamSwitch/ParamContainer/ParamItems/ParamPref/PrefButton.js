import {
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from "@chakra-ui/react";
import { HiDotsHorizontal } from "react-icons/hi";
import PrefMenu from "./PrefMenu";

export default function PrefButton(props) {
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        aria-label="Options"
        icon={<HiDotsHorizontal />}
        borderRadius="full"
        variant="ghost"
        size="xs"
        color="gray.400"
      />
      <PrefMenu />
    </Menu>
  );
}
