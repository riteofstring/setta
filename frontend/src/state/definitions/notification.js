import { create } from "./utils";

export const useNotification = create(() => ({
  message: "",
  timeoutId: null,
}));
