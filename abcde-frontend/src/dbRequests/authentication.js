import axios from "axios";
import { useAuth } from "models/auth";
import { BACKEND, NO_AUTH } from "utils/constants";
import {
  noAuthAccessPage,
  noAuthLogin,
  noAuthLogout,
  noAuthRegister,
} from "./noAuth/authentication";

export function accessPage({ address }) {
  const s = useAuth.getState();
  const access_token = s.access_token;
  const stayLoggedIn = s.stayLoggedIn;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthAccessPage({ stayLoggedIn });
  }

  return axios
    .post(BACKEND + address, null, tokenConfig(access_token))
    .then(() => {
      stayLoggedIn();
      return true;
    })
    .catch(() => {
      loginFail();
      return false;
    });
}

export function login({ username, password }) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogin({ loginSuccess });
  }

  return axios
    .post(BACKEND + "auth/login", { username, password }, tokenConfig(null))
    .then((res) => {
      loginSuccess(res.data);
      return true;
    })
    .catch(() => {
      loginFail();
      return false;
    });
}

export function logout() {
  const s = useAuth.getState();
  const access_token = s.access_token;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthLogout({ loginFail });
  }

  axios
    .post(BACKEND + "api/auth/logout", null, tokenConfig(access_token))
    .then(() => {
      loginFail();
    })
    .catch(() => {
      loginFail();
    });
}

export function register({ username, password }) {
  const s = useAuth.getState();
  const loginSuccess = s.loginSuccess;
  const loginFail = s.loginFail;

  if (NO_AUTH) {
    return noAuthRegister({ loginSuccess });
  }

  axios
    .post(BACKEND + "auth/register", { username, password }, tokenConfig(null))
    .then((res) => {
      loginSuccess(res.data);
    })
    .catch(() => {
      loginFail();
    });
}

export function tokenConfig(access_token) {
  // Headers
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  // If token, add to headers config
  if (access_token) {
    config.headers["Authorization"] = `Bearer ${access_token}`;
  }

  return config;
}
