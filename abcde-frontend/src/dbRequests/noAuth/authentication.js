export function noAuthAccessPage({ stayLoggedIn }) {
  stayLoggedIn();
  return true;
}

export function noAuthLogin({ loginSuccess }) {
  loginSuccess();
  return true;
}

export function noAuthLogout({ loginFail }) {
  loginFail(null);
  return;
}

export function noAuthRegister({ loginSuccess }) {
  loginSuccess();
  return true;
}
