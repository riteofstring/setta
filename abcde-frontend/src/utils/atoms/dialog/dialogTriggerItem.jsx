import * as Dialog from "@radix-ui/react-dialog";
import { MenuItem } from "../menubar/menudropdownitem";

export function DialogTriggerItem({ children, shortcut, onClick }) {
  return (
    <MenuItem shortcut={shortcut} onClick={onClick}>
      <Dialog.Trigger className="contents">{children}</Dialog.Trigger>
    </MenuItem>
  );
}
