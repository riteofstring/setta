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

export async function dbLogin({ username, password }: AuthType) {
  if (NO_AUTH) {
    return noAuthLogin();
  }

  return await post({
    address: LOGIN,
    body: { username, password },
    withCredentials: true,
  });
}

export function dbLogout() {
  if (NO_AUTH) {
    return noAuthLogout();
  }

  return post({
    body: {},
    address: LOGOUT,
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
  });
}
