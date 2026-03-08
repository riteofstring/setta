import * as Dialog from "@radix-ui/react-dialog";
import { useEffect } from "react";
import { openWorkspaceSwitcherModal } from "state/actions/modal";
import { useModal } from "state/definitions";
import { MODAL_OVERLAY_Z_INDEX_CLASS_NAME } from "utils/constants";
import { consumeOpenWorkspaceSwitcherRequest } from "utils/workspaceSwitcherLaunch";
import { PublishAppDeploymentModal } from "./AppDeploymentsModal/PublishAppDeploymentModal";
import { DeleteJSONSourceVariantModal } from "./DeleteFileModal/DeleteFileModal";
import { DeleteProjectWarningModal } from "./DeleteProjectWarningModal/DeleteProjectWarningModal";
import { DropzoneFilePickerModal } from "./DropzoneFilePickerModal/DropzoneFilePickerModal";
import { FileMenuLoadProjectConfigModal } from "./FileMenuModal/FileMenuLoadModal";
import { FileMenuSaveProjectConfigAsModal } from "./FileMenuModal/FileMenuSaveAsModal";
import { RenameReferencesModal } from "./RenameReferencesModal/RenameReferencesModal";
import { PublishShareDeploymentModal } from "./ShareDeploymentsModal/PublishShareDeploymentModal";
import { WorkspaceSwitcherModal } from "./WorkspaceSwitcherModal/WorkspaceSwitcherModal";
import "./styles.css";
import { ModalTypeEnum } from "./types";

export function ModalContainer({ children }) {
  const open = useModal((x) => x.open);
  const modalType = useModal((x) => x.modalInfo?.type);

  useEffect(() => {
    if (consumeOpenWorkspaceSwitcherRequest()) {
      openWorkspaceSwitcherModal();
    }
  }, []);

  const contentClassName =
    modalType === ModalTypeEnum.WORKSPACE_SWITCHER
      ? "animate-[contentShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] fixed left-1/2 top-1/2 z-[100] flex max-h-[85vh] min-h-0 w-[92vw] max-w-[920px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-setta-200/80 bg-white/95 px-5 pb-4 pt-5 shadow-[0_22px_70px_-30px_rgba(15,23,42,0.6)] ring-1 ring-white/80 backdrop-blur dark:border-setta-700/80 dark:bg-setta-900/95 dark:ring-setta-800/70"
      : "animate-[contentShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] fixed left-1/2 top-1/2 z-[100] flex max-h-[clamp(14rem,86vh,42rem)] min-h-0 w-[92vw] max-w-[920px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-setta-200/80 bg-white/95 px-5 pb-4 pt-5 shadow-[0_22px_70px_-30px_rgba(15,23,42,0.6)] ring-1 ring-white/80 backdrop-blur dark:border-setta-700/80 dark:bg-setta-900/95 dark:ring-setta-800/70";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(newOpen) => useModal.setState({ open: newOpen })}
    >
      {children}
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 ${MODAL_OVERLAY_Z_INDEX_CLASS_NAME} animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-black/45 backdrop-blur-sm`}
        />
        <Dialog.Content className={contentClassName} data-tab-native>
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
    case ModalTypeEnum.WORKSPACE_SWITCHER:
      return <WorkspaceSwitcherModal />;
    default:
      return modalInfo satisfies never;
  }
}
