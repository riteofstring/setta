import { NO_AUTH } from "utils/constants";
import { create } from "./utils";

const initialState = {
  username: NO_AUTH ? "Kevin" : localStorage.getItem("username") || "",
  isAuthenticated: NO_AUTH ? true : !!localStorage.getItem("isAuthenticated"),
  darkMode: NO_AUTH ? false : JSON.parse(localStorage.getItem("darkMode")),
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
  localStorage.setItem(key, JSON.stringify(value));
}
