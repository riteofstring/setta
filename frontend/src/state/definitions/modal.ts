import { createProjectState } from "./utils";

export const useModal = createProjectState(() => ({
  open: false,
  modalType: null,
  modalData: null,
}));
