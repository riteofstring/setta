export function noAuthLogin({ loginSuccess }) {
  loginSuccess({ data: { username: "Kevin" } });
  return true;
}

export function noAuthLogout() {
  return;
}

export function noAuthRegister({ loginSuccess }) {
  loginSuccess({ data: { username: "Kevin" } });
  return true;
}
