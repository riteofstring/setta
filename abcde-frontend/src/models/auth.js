import { NO_AUTH } from "utils/constants";
import { create } from "./utils";

export const useAuth = create((set) => ({
  isAuthenticated: NO_AUTH ? true : false,
  loginSuccess: () =>
    set(() => {
      return { isAuthenticated: true };
    }),
  loginFail: () =>
    set(() => {
      localStorage.clear();
      sessionStorage.clear();
      return { isAuthenticated: false };
    }),
  stayLoggedIn: () => set(() => ({ isAuthenticated: true })),
}));
