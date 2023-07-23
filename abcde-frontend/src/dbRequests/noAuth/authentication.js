export function noAuthLogin() {
  return { data: { username: "Kevin" } };
}

export function noAuthLogout() {
  return;
}

export function noAuthRegister({ loginSuccess }) {
  loginSuccess({ data: { username: "Kevin" } });
  return true;
}
