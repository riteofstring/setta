import { NO_AUTH } from "utils/constants";
import { create } from "./utils";

type AuthStateType = { username: string; isAuthenticated: boolean };
type AuthActionType = {
  loginSuccess: (payload) => void;
  loginFail: () => void;
};
type AuthZustandType = AuthStateType & AuthActionType;

export const useAuth = create<AuthZustandType>((set) => ({
  username: NO_AUTH ? "Kevin" : localStorage.getItem("username") || "",
  isAuthenticated: NO_AUTH ? true : !!localStorage.getItem("isAuthenticated"),
  loginSuccess: (username) =>
    set(() => {
      const isAuthenticated = true;
      localStorage.setItem("username", username);
      localStorage.setItem("isAuthenticated", "true");
      return { username, isAuthenticated };
    }),
  loginFail: () =>
    set(() => {
      localStorage.clear();
      sessionStorage.clear();
      return { username: "", isAuthenticated: false };
    }),
}));
