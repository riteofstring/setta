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
