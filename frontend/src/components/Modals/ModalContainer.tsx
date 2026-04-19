import * as Dialog from "@radix-ui/react-dialog";
import {
  createAppSubsystemFrontendHost,
  useAppSubsystemAppDeploymentModal,
} from "plugins/appSubsystem";
import { AppSubsystemRendererHost } from "plugins/appSubsystemRendererHost";
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { closeModal, openWorkspaceSwitcherModal } from "state/actions/modal";
import { useModal } from "state/definitions";
import { MODAL_OVERLAY_Z_INDEX_CLASS_NAME } from "utils/constants";
import { consumeOpenWorkspaceSwitcherRequest } from "utils/workspaceSwitcherLaunch";
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

type ModalRenderer = (open: boolean) => JSX.Element;

const MODAL_RENDERERS: Partial<Record<ModalTypeEnum, ModalRenderer>> = {
  [ModalTypeEnum.DELETE_PROJECT_WARNING]: () => <DeleteProjectWarningModal />,
  [ModalTypeEnum.DELETE_JSON_SOURCE_FILE]: () => (
    <DeleteJSONSourceVariantModal />
  ),
  [ModalTypeEnum.FILE_MENU_LOAD_PROJECT_CONFIG]: (open) => (
    <FileMenuLoadProjectConfigModal open={open} />
  ),
  [ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS]: (open) => (
    <FileMenuSaveProjectConfigAsModal open={open} />
  ),
  [ModalTypeEnum.RENAME_REFERENCES]: () => <RenameReferencesModal />,
  [ModalTypeEnum.PUBLISH_SHARE_DEPLOYMENT]: (open) => (
    <PublishShareDeploymentModal open={open} />
  ),
  [ModalTypeEnum.DROPZONE_FILE_PICKER]: (open) => (
    <DropzoneFilePickerModal open={open} />
  ),
  [ModalTypeEnum.WORKSPACE_SWITCHER]: () => <WorkspaceSwitcherModal />,
};

export function ModalContainer({ children }) {
  const location = useLocation();
  const open = useModal((x) => x.open);
  const modalType = useModal((x) => x.modalInfo?.type);

  useEffect(() => {
    if (consumeOpenWorkspaceSwitcherRequest()) {
      openWorkspaceSwitcherModal();
    }
  }, [location.key, location.pathname, location.search]);

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
  const appDeploymentModal = useAppSubsystemAppDeploymentModal();
  const appSubsystemHost = useMemo(
    () => createAppSubsystemFrontendHost({ closeModal }),
    [],
  );

  if (!open || !modalInfo) {
    return null;
  }

  if (modalInfo.type === ModalTypeEnum.PUBLISH_APP_DEPLOYMENT) {
    if (!appDeploymentModal) {
      return null;
    }
    return (
      <AppSubsystemRendererHost
        renderer={appDeploymentModal.renderer}
        props={{ open }}
        host={appSubsystemHost}
        className="w-full"
        testId="app-subsystem-app-deployment-modal"
      />
    );
  }

  const renderModal = MODAL_RENDERERS[modalInfo.type];
  return renderModal ? renderModal(open) : null;
}
