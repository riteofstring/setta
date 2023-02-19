import * as Dialog from "@radix-ui/react-dialog";
import { Item } from "../dropdown/item";

export function DialogTriggerItem({ children, onClick }) {
  return (
    <Dialog.Trigger>
      <Item onClick={onClick}>{children}</Item>
    </Dialog.Trigger>
  );
}
