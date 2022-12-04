import {
  accessPage as accessPageDb,
  login as loginDb,
  logout as logoutDb,
} from "dbRequests/authentication";
import { useAuth } from "models/auth";

export function accessPage({ address }) {
  const s = useAuth.getState();
  const access_token = s.access_token;
  const actionStayLoggedIn = s.stayLoggedIn;
  const actionLoginFail = s.loginFail;
  accessPageDb({
    address,
    access_token,
    actionStayLoggedIn,
    actionLoginFail,
  });
}

export function login({ username, password }) {
  const s = useAuth.getState();
  const actionLoginSuccess = s.loginSuccess;
  const actionLoginFail = s.loginFail;
  loginDb({
    username,
    password,
    actionLoginSuccess,
    actionLoginFail,
  });
}

export function logout() {
  const s = useAuth.getState();
  const access_token = s.access_token;
  const actionLoginFail = s.loginFail;
  logoutDb({ actionLoginFail, access_token });
}
