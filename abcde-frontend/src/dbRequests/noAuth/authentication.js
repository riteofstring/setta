import { loadUser } from "abcde-test/src/loaders/helpers";

export async function noAuthLogin() {
  const data = await loadUser("Kevin");
  data.username = data.name;
  return { data, status: 200 };
}

export function noAuthLogout() {
  return;
}

export async function noAuthRegister() {
  return await noAuthLogin();
}
