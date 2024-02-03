import { createProjectState } from "./utils";

export const useModal = createProjectState((set) => ({
  open: false,
  modalType: null,
  modalData: null,
  setOpen: (payload) => set({ open: payload }),
  setModalType: (payload) => set({ modalType: payload }),
  setModalData: (payload) => set({ modalData: payload }),
}));
