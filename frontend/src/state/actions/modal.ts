import { ModalDataMap, ModalType } from "components/Modals/types";
import _ from "lodash";
import { useModal } from "state/definitions";
import { MODAL_TYPE } from "utils/constants";

export function setModalOpen(open: boolean) {
  if (open) {
    useModal.setState({ open });
  } else {
    useModal.getState().reset();
  }
}

export function openModal<T extends keyof ModalDataMap>(
  type: T,
  data: ModalDataMap[T],
) {
  useModal.setState({ open: true, modalInfo: { type, data } });
}

export function openLoadModal() {
  openModal(MODAL_TYPE.LOAD_PROJECT_CONFIG);
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

export function openDeleteProjectWarningModal(selectedProjects) {
  openModal(MODAL_TYPE.DELETE_PROJECT_WARNING, selectedProjects);
}

export function openRenameReferencesModal(changedValues) {
  openModal(MODAL_TYPE.RENAME_REFERENCES, changedValues);
}

export function openDeleteJSONSourceFileModal(
  sectionId: string,
  variantId: string,
  filepath: string,
) {
  openModal(MODAL_TYPE.DELETE_JSON_SOURCE_FILE, {
    sectionId,
    variantId,
    filepath,
  });
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
