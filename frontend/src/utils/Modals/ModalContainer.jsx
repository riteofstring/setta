import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "models/modal";
import {
  FileMenuLoadModal,
  FileMenuSaveAsModal,
} from "utils/Modals/FileMenuModal/FileMenuModal";
import "./styles.css";

export function ModalContainer({ children }) {
  const open = useModal((x) => x.open);
  const setOpen = useModal((x) => x.setOpen);

  console.log("ModalContainer");
  console.log("open", open);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm " />
        <Dialog.Content className="animate-[contentShow_150ms_cubic-bezier(0.16,_1,_ 0.3,_ 1) fixed top-1/2 left-1/2 z-[100] flex max-h-[85vh] w-[90vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white px-7 py-7 shadow-xl dark:border dark:border-runcoder-600 dark:bg-runcoder-800">
          <ModalContent open={open} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModalContent({ open }) {
  const modalType = useModal((x) => x.modalType);

  if (!open) {
    return null;
  }

  if (modalType === "Load") {
    return <FileMenuLoadModal open={open} />;
  } else if (modalType === "Save As") {
    return <FileMenuSaveAsModal open={open} />;
  }

  return "This is a test";
}
