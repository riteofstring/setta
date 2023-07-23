import { LOGIN, LOGOUT, REGISTER } from "abcde-utils/src/routes";
import { AuthType } from "abcde-utils/src/types/auth";
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

export function dbRegister({ username, password }: AuthType) {
  if (NO_AUTH) {
    return noAuthRegister();
  }

  return post({
    address: REGISTER,
    body: { username, password },
    withCredentials: true,
  });
}
