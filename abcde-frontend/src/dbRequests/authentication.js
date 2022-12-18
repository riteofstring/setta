import { useAuth } from "models/auth";
import { NO_AUTH } from "utils/constants";
import {
  noAuthAccessPage,
  noAuthLogin,
  noAuthLogout,
  noAuthRegister,
} from "./noAuth/authentication";
import { post } from "./utils";

export function accessPage({ address }) {
  const s = useAuth.getState();
  const stayLoggedIn = s.stayLoggedIn;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthAccessPage({ stayLoggedIn });
  }

  return post({ address, thenFn: stayLoggedIn, catchFn: loginFail });
}

export function login({ username, password }) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogin({ loginSuccess });
  }

  return post({
    address: "auth/login",
    body: { username, password },
    thenFn: (res) => loginSuccess(res.data),
    catchFn: loginFail,
  });
}

export function logout() {
  const s = useAuth.getState();
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogout({ loginFail });
  }

  return post({
    address: "auth/logout",
    thenFn: loginFail,
    catchFn: loginFail,
  });
}

export function register({ username, password }) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthRegister({ loginSuccess });
  }

  return post({
    address: "auth/register",
    body: { username, password },
    thenFn: (res) => loginSuccess(res.data),
    catchFn: loginFail,
  });
}
