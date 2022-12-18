import { create } from "./utils";

export const useAuth = create((set) => ({
  isAuthenticated: false,
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
