import { useModal } from "state/definitions";
import { MODAL_TYPE } from "utils/constants";

export function setModalOpen(open) {
  if (open) {
    useModal.setState({ open });
  } else {
    useModal.getState().reset();
  }
}

function openFileMenuModal(modalType, modalData) {
  useModal.setState({ modalType, modalData, open: true });
}

export function openLoadModal() {
  openFileMenuModal(MODAL_TYPE.LOAD_PROJECT_CONFIG);
}

export function openSaveAsModal() {
  openFileMenuModal(MODAL_TYPE.SAVE_PROJECT_CONFIG_AS);
}

export function openSaveAsWithRefsModal() {
  openFileMenuModal(MODAL_TYPE.SAVE_PROJECT_CONFIG_AS_WITH_REFS);
}

export function openExportJSONModal() {
  openFileMenuModal(MODAL_TYPE.EXPORT_JSON);
}

export function openExportFullJSONModal() {
  openFileMenuModal(MODAL_TYPE.EXPORT_FULL_JSON);
}

export function openImportJSONModal() {
  openFileMenuModal(MODAL_TYPE.IMPORT_JSON);
}

export function openDeleteProjectWarningModal(selectedProjects) {
  openFileMenuModal(MODAL_TYPE.DELETE_PROJECT_WARNING, selectedProjects);
}
