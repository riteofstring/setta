import { LOGIN, LOGOUT, REGISTER } from "abcde-utils/src/routes";
import { AuthType } from "abcde-utils/src/types/auth";
import { post } from "./utils";

export async function dbLogin({ username, password }: AuthType) {
  return await post({
    address: LOGIN,
    body: { username, password },
    withCredentials: true,
  });
}

export function dbLogout() {
  return post({
    body: {},
    address: LOGOUT,
    withCredentials: true,
  });
}

export async function dbRegister({ username, password }: AuthType) {
  return await post({
    address: REGISTER,
    body: { username, password },
    withCredentials: true,
  });
}
