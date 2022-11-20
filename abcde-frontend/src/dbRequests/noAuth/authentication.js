export function noAuthAccessPage({ actionStayLoggedIn }) {
  actionStayLoggedIn();
  return true;
}

export function noAuthLogin({ actionLoginSuccess }) {
  actionLoginSuccess({ user: "user", access_token: "12345" });
  return true;
}

export function noAuthLogout({ actionLoginFail }) {
  actionLoginFail(null);
  return;
}

export function noAuthRegister({ actionLoginSuccess }) {
  actionLoginSuccess({ user: "user", access_token: "12345" });
  return true;
}
