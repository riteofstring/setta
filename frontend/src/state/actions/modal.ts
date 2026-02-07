import {
  ModalDataMap,
  ModalInfoType,
  ModalType,
  ModalTypeEnum,
} from "components/Modals/types";
import _ from "lodash";
import { useModal } from "state/definitions";

export function closeModal() {
  useModal.getState().reset();
}

function openModal(modalInfo: ModalInfoType) {
  useModal.setState({ open: true, modalInfo });
}

export function openDeleteProjectWarningModal(
  data: ModalDataMap["DELETE_PROJECT_WARNING"],
) {
  openModal({ type: ModalTypeEnum.DELETE_PROJECT_WARNING, data });
}

export function openDeleteJSONSourceFileModal(
  data: ModalDataMap["DELETE_JSON_SOURCE_FILE"],
) {
  openModal({ type: ModalTypeEnum.DELETE_JSON_SOURCE_FILE, data });
}

export function openFileMenuLoadProjectConfigModal() {
  openModal({ type: ModalTypeEnum.FILE_MENU_LOAD_PROJECT_CONFIG, data: null });
}

export function openFileMenuSaveProjectConfigAsModal() {
  openModal({
    type: ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS,
    data: { saveWithRefs: false },
  });
}

export function openFileMenuSaveProjectConfigAsWithRefsModal() {
  openModal({
    type: ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS,
    data: { saveWithRefs: true },
  });
}

export function openRenameReferencesModal(
  data: ModalDataMap["RENAME_REFERENCES"],
) {
  openModal({ type: ModalTypeEnum.RENAME_REFERENCES, data });
}

export function openPublishShareDeploymentModal() {
  openModal({ type: ModalTypeEnum.PUBLISH_SHARE_DEPLOYMENT, data: null });
}

export function openDropzoneFilePickerModal(
  data: ModalDataMap["DROPZONE_FILE_PICKER"],
) {
  openModal({ type: ModalTypeEnum.DROPZONE_FILE_PICKER, data });
}

export function openWorkspaceSwitcherModal() {
  openModal({ type: ModalTypeEnum.WORKSPACE_SWITCHER, data: null });
}

export function useModalData<T extends ModalType>(
  modalType: T,
): ModalDataMap[T] {
  return useModal((state) => {
    if (state.modalInfo?.type === modalType) {
      return state.modalInfo.data;
    }
    throw new Error();
  }, _.isEqual);
}
