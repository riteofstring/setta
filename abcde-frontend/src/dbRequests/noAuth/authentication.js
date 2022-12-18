export function noAuthAccessPage({ stayLoggedIn }) {
  stayLoggedIn();
  return true;
}

export function noAuthLogin({ loginSuccess }) {
  loginSuccess({ access_token: "12345" });
  return true;
}

export function noAuthLogout({ loginFail }) {
  loginFail(null);
  return;
}

export function noAuthRegister({ loginSuccess }) {
  loginSuccess({ access_token: "12345" });
  return true;
}
