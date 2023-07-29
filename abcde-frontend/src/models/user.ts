import { create } from "./utils";

const initialState = {
  username: localStorage.getItem("username") || "",
  isAuthenticated: !!localStorage.getItem("isAuthenticated"),
  darkMode: JSON.parse(localStorage.getItem("darkMode")),
};

export const useUser = create((set) => ({
  ...initialState,
  loginSuccess: (data) =>
    set(() => {
      const isAuthenticated = true;
      setLocalStorage("username", data.username);
      setLocalStorage("isAuthenticated", isAuthenticated);
      setLocalStorage("darkMode", data.darkMode);
      return { ...data, isAuthenticated };
    }),
  loginFail: () =>
    set(() => {
      localStorage.clear();
      sessionStorage.clear();
      return { ...initialState, username: "", isAuthenticated: false };
    }),
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
