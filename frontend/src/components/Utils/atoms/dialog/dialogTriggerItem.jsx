import * as Dialog from "@radix-ui/react-dialog";
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
