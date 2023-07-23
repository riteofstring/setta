import { loadUser } from "abcde-test/src/loaders/helpers";

export async function noAuthLogin() {
  return { data: await loadUser("Kevin") };
}

export function noAuthLogout() {
  return;
}

export async function noAuthRegister() {
  return { data: await loadUser("Kevin") };
}
