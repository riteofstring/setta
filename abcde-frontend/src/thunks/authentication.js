import {
  accessPage as accessPageDb,
  login as loginDb,
  logout as logoutDb,
} from "dbRequests/authentication";
import { thunk } from "easy-peasy";

export const accessPage = thunk((actions, payload, helpers) => {
  const { address } = payload;
  const a = helpers.getStoreActions();
  const access_token = helpers.getStoreState().auth.access_token;
  const actionStayLoggedIn = a.auth.stayLoggedIn;
  const actionLoginFail = a.auth.loginFail;
  accessPageDb({
    address,
    access_token,
    actionStayLoggedIn,
    actionLoginFail,
  });
});

export const login = thunk((actions, payload, helpers) => {
  const { username, password } = payload;
  const a = helpers.getStoreActions();
  const actionLoginSuccess = a.auth.loginSuccess;
  const actionLoginFail = a.auth.loginFail;
  loginDb({
    username,
    password,
    actionLoginSuccess,
    actionLoginFail,
  });
});

export const logout = thunk((actions, payload, helpers) => {
  const access_token = helpers.getStoreState().auth.access_token;
  const actionLoginFail = helpers.getStoreActions().auth.loginFail;
  logoutDb({ actionLoginFail, access_token });
});
