import { MenuList, MenuItem } from "@chakra-ui/react";

const menuItems = [
  "TEXT",
  "SLIDER",
  "BOOLEAN",
  "INCREMENTER",
  "NESTED_OBJECT",
  "LIST_NESTED_OBJECT",
];

export default function PrefMenu(props) {
  return (
    <MenuList>
      {menuItems.map((e, idx) => (
        <MenuItem key={`MenuItem-${e}-${idx}`} onClick={() => props.onClick(e)}>
          {e}
        </MenuItem>
      ))}
    </MenuList>
  );
}
