import {
  accessPage as accessPageDb,
  login as loginDb,
  logout as logoutDb,
} from "dbRequests/authentication";
import { thunk } from "easy-peasy";
import { useAuth } from "models/auth";

export const accessPage = thunk((actions, payload, helpers) => {
  const { address } = payload;
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
});

export const login = thunk((actions, payload, helpers) => {
  const { username, password } = payload;
  const s = useAuth.getState();
  const actionLoginSuccess = s.loginSuccess;
  const actionLoginFail = s.loginFail;
  loginDb({
    username,
    password,
    actionLoginSuccess,
    actionLoginFail,
  });
});

export const logout = thunk((actions, payload, helpers) => {
  const s = useAuth.getState();
  const access_token = s.access_token;
  const actionLoginFail = s.loginFail;
  logoutDb({ actionLoginFail, access_token });
});
