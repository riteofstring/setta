import { LOGIN, LOGOUT, REGISTER } from "abcde-utils/src/routes";
import { AuthType } from "abcde-utils/src/types/auth";
import { useAuth } from "models/auth";
import { NO_AUTH } from "utils/constants";
import {
  noAuthLogin,
  noAuthLogout,
  noAuthRegister,
} from "./noAuth/authentication";
import { post } from "./utils";

export function login({ username, password }: AuthType) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogin({ loginSuccess });
  }

  return post({
    address: LOGIN,
    body: { username, password },
    thenFn: loginSuccess,
    catchFn: loginFail,
    withCredentials: true,
  });
}

export function logout() {
  const s = useAuth.getState();
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogout({ loginFail });
  }

  return post({
    body: {},
    address: LOGOUT,
    thenFn: loginFail,
    catchFn: loginFail,
    withCredentials: true,
  });
}

export function register({ username, password }: AuthType) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthRegister({ loginSuccess });
  }

  return post({
    address: REGISTER,
    body: { username, password },
    thenFn: loginSuccess,
    catchFn: loginFail,
  });
}
