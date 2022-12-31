import { NO_AUTH } from "utils/constants";
import { create } from "./utils";

type AuthStateType = { isAuthenticated: boolean };
type AuthActionType = { loginSuccess: () => void; loginFail: () => void };
type AuthZustandType = AuthStateType & AuthActionType;

export const useAuth = create<AuthZustandType>((set) => ({
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
}));
