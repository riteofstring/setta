import { create } from "./utils";

const initialState = {
  darkMode: JSON.parse(localStorage.getItem("darkMode")),
};

export const useUser = create((set) => ({
  ...initialState,
  toggleDarkMode: () =>
    set((state) => {
      const newVal = !state.darkMode;
      setLocalStorage("darkMode", newVal);
      return { darkMode: newVal };
    }),
}));

function setLocalStorage(key, value) {
  localStorage.setItem(
    key,
    typeof value === "string" ? value : JSON.stringify(value)
  );
}
