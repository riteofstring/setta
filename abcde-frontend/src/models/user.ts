import { NO_AUTH } from "utils/constants";
import { create } from "./utils";

const initialState = {
  username: NO_AUTH ? "Kevin" : localStorage.getItem("username") || "",
  isAuthenticated: NO_AUTH ? true : !!localStorage.getItem("isAuthenticated"),
  darkMode: false,
};

export const useUser = create((set) => ({
  ...initialState,
  loginSuccess: (data) =>
    set(() => {
      const isAuthenticated = true;
      localStorage.setItem("username", data.username);
      localStorage.setItem("isAuthenticated", "true");
      return { ...data, isAuthenticated };
    }),
  loginFail: () =>
    set(() => {
      localStorage.clear();
      sessionStorage.clear();
      return { ...initialState, username: "", isAuthenticated: false };
    }),
}));
