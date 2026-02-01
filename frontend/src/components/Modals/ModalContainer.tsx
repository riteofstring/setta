import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "state/definitions";
import { PublishAppDeploymentModal } from "./AppDeploymentsModal/PublishAppDeploymentModal";
import { DeleteJSONSourceVariantModal } from "./DeleteFileModal/DeleteFileModal";
import { DeleteProjectWarningModal } from "./DeleteProjectWarningModal/DeleteProjectWarningModal";
import { DropzoneFilePickerModal } from "./DropzoneFilePickerModal/DropzoneFilePickerModal";
import { FileMenuLoadProjectConfigModal } from "./FileMenuModal/FileMenuLoadModal";
import { FileMenuSaveProjectConfigAsModal } from "./FileMenuModal/FileMenuSaveAsModal";
import { RenameReferencesModal } from "./RenameReferencesModal/RenameReferencesModal";
import { PublishShareDeploymentModal } from "./ShareDeploymentsModal/PublishShareDeploymentModal";
import "./styles.css";
import { ModalTypeEnum } from "./types";

export function ModalContainer({ children }) {
  const open = useModal((x) => x.open);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(newOpen) => useModal.setState({ open: newOpen })}
    >
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm " />
        <Dialog.Content
          className="animate-[contentShow_150ms_cubic-bezier(0.16,_1,_ 0.3,_ 1) fixed left-1/2 top-1/2 z-[100] flex max-h-[clamp(10rem,85vh,30rem)] min-h-0 w-[90vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white px-7 pb-3 pt-7 shadow-xl dark:border dark:border-setta-600 dark:bg-setta-800"
          data-tab-native
        >
          <ModalContent open={open} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModalContent({ open }: { open: boolean }) {
  const modalInfo = useModal((x) => x.modalInfo);

  if (!open || !modalInfo) {
    return null;
  }

  switch (modalInfo.type) {
    case ModalTypeEnum.DELETE_PROJECT_WARNING:
      return <DeleteProjectWarningModal />;
    case ModalTypeEnum.DELETE_JSON_SOURCE_FILE:
      return <DeleteJSONSourceVariantModal />;
    case ModalTypeEnum.FILE_MENU_LOAD_PROJECT_CONFIG:
      return <FileMenuLoadProjectConfigModal open={open} />;
    case ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS:
      return <FileMenuSaveProjectConfigAsModal open={open} />;
    case ModalTypeEnum.RENAME_REFERENCES:
      return <RenameReferencesModal />;
    case ModalTypeEnum.PUBLISH_SHARE_DEPLOYMENT:
      return <PublishShareDeploymentModal open={open} />;
    case ModalTypeEnum.PUBLISH_APP_DEPLOYMENT:
      return <PublishAppDeploymentModal open={open} />;
    case ModalTypeEnum.DROPZONE_FILE_PICKER:
      return <DropzoneFilePickerModal open={open} />;
    default:
      return modalInfo satisfies never;
  }
}
