import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "models/modal";
import { useEffect } from "react";
import { FileMenuLoadModal } from "./FileMenuModal/FileMenuLoadModal";
import { FileMenuSaveAsModal } from "./FileMenuModal/FileMenuSaveAsModal";
import {
  ExportJSONModal,
  ImportJSONModal,
} from "./ImportExportModal/ImportExportModal";
import { CreateFromArgparseModal } from "./PaneContextModal/CreateFromArgparseModal";
import { LoadSectionModal } from "./PaneContextModal/LoadSectionModal";
import { SaveUITypeConfigModal } from "./SaveUITypeConfigModal/SaveUITypeConfigModal";
import { CreateNewEnteredValuesModal } from "./SectionSaveButtonModal/CreateNewEnteredValuesModal";
import { SaveCustomArgumentsModal } from "./SectionSaveButtonModal/SaveCustomArgumentsModal";
import "./styles.css";

export function ModalContainer({ children }) {
  const open = useModal((x) => x.open);
  const setOpen = useModal((x) => x.setOpen);
  const setModalData = useModal((x) => x.setModalData);

  useEffect(() => {
    if (!open) {
      setModalData(null);
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm " />
        <Dialog.Content className="animate-[contentShow_150ms_cubic-bezier(0.16,_1,_ 0.3,_ 1) fixed left-1/2 top-1/2 z-[100] flex max-h-[85vh] w-[90vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white px-7 py-7 shadow-xl dark:border dark:border-runcoder-600 dark:bg-runcoder-800">
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

  switch (modalType) {
    case "Load":
      return <FileMenuLoadModal open={open} />;
    case "Save As":
      return <FileMenuSaveAsModal open={open} />;
    case "Export JSON":
    case "Export Full JSON":
      return <ExportJSONModal modalType={modalType} open={open} />;
    case "Import JSON":
      return <ImportJSONModal />;
    case "Create From Argparse":
      return <CreateFromArgparseModal />;
    case "Load Section":
      return <LoadSectionModal open={open} />;
    case "SaveUITypeConfig":
      return <SaveUITypeConfigModal open={open} />;
    case "Custom Arguments":
      return <SaveCustomArgumentsModal open={open} />;
    case "Create New Entered Values":
      return <CreateNewEnteredValuesModal />;
    default:
      return null;
  }
}
