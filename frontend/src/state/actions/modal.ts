import {
  ModalDataMap,
  ModalInfoType,
  ModalType,
  ModalTypeEnum,
} from "components/Modals/types";
import _ from "lodash";
import { useModal } from "state/definitions";
import { MODAL_TYPE } from "utils/constants";

export function closeModal() {
  useModal.getState().reset();
}

export function openModal(modalInfo: ModalInfoType) {
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

export function openSaveAsModal() {
  openModal(MODAL_TYPE.SAVE_PROJECT_CONFIG_AS);
}

export function openSaveAsWithRefsModal() {
  openModal(MODAL_TYPE.SAVE_PROJECT_CONFIG_AS_WITH_REFS);
}

export function openExportJSONModal() {
  openModal(MODAL_TYPE.EXPORT_JSON);
}

export function openImportJSONModal() {
  openModal(MODAL_TYPE.IMPORT_JSON);
}

export function openRenameReferencesModal(changedValues) {
  openModal(MODAL_TYPE.RENAME_REFERENCES, changedValues);
}

export function openAddArtifactByFilepathModal(sectionId) {
  openModal(MODAL_TYPE.ADD_ARTIFACT_BY_FILEPATH, sectionId);
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
