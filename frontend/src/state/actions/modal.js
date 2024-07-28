import { useModal } from "state/definitions";

export function setModalOpen(payload) {
  useModal.setState({ open: payload });
}
export function setModalType(payload) {
  useModal.setState({ modalType: payload });
}
export function setModalData(payload) {
  useModal.setState({ modalData: payload });
}

function openFileMenuModal(modalType) {
  setModalType(modalType);
  setModalOpen(true);
}

export function openLoadModal() {
  openFileMenuModal("Load");
}

export function openSaveAsModal() {
  openFileMenuModal("Save As");
}

export function openExportJSONModal() {
  openFileMenuModal("Export JSON");
}

export function openExportFullJSONModal() {
  openFileMenuModal("Export Full JSON");
}

export function openImportJSONModal() {
  openFileMenuModal("Import JSON");
}
