import * as Dialog from "@radix-ui/react-dialog";
import "./styles.css";

export default function ModalContainer({ content, children }) {
  return (
    <Dialog.Root>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content className="DialogContent">{content}</Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
