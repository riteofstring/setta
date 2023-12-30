import { createProjectState } from "./utils";

export const useModal = createProjectState((set) => ({
  open: false,
  modalType: null,
  setOpen: (payload) => set({ open: payload }),
  setModalType: (payload) => set({ modalType: payload }),
}));
