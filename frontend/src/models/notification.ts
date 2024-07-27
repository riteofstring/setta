import { create } from "./utils";

export const useNotification = create((set) => ({
  message: "",
  timeoutId: null,
  setMessage: (payload) =>
    set((state) => {
      // get rid of old setTimeout call
      if (state.timeoutId !== null) {
        clearTimeout(state.timeoutId);
      }
      const id = setTimeout(() => set({ message: "" }), 3000);
      return { message: payload, timeoutId: id };
    }),
}));
