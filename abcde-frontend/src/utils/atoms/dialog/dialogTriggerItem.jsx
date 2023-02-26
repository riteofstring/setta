import * as Dialog from "@radix-ui/react-dialog";
import { Item } from "../dropdown/item";
import { MenuItem } from "../menubar/menudropdownitem";

export function DialogMenuBarTriggerItem({ children, shortcut, onClick }) {
  return (
    <Dialog.Trigger className="contents">
      <MenuItem shortcut={shortcut} onClick={onClick}>
        {children}
      </MenuItem>
    </Dialog.Trigger>
  );
}

export function DialogDropdownTriggerItem({ children, onClick }) {
  return (
    <Dialog.Trigger className="contents">
      <Item onClick={onClick}>{children}</Item>
    </Dialog.Trigger>
  );
}
