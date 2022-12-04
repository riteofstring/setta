import create from "zustand";

export const useAuth = create((set) => ({
  access_token: localStorage.getItem("access_token"),
  isAuthenticated: false,
  loginSuccess: (payload) =>
    set(() => {
      localStorage.setItem("access_token", payload.access_token);
      return { access_token: payload.access_token, isAuthenticated: true };
    }),
  loginFail: () =>
    set(() => {
      localStorage.clear();
      sessionStorage.clear();
      return { access_token: null, isAuthenticated: false };
    }),
  stayLoggedIn: () => set(() => ({ isAuthenticated: true })),
}));
