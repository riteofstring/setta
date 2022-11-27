import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import {
  noAuthAccessPage,
  noAuthLogin,
  noAuthLogout,
  noAuthRegister,
} from "./noAuth/authentication";

export function accessPage({
  address,
  access_token,
  actionStayLoggedIn,
  actionLoginFail,
}) {
  if (NO_AUTH) {
    return noAuthAccessPage({ actionStayLoggedIn });
  }

  return axios
    .post(BACKEND + address, null, tokenConfig(access_token))
    .then(() => {
      actionStayLoggedIn();
      return true;
    })
    .catch(() => {
      actionLoginFail();
      return false;
    });
}

export function login({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) {
  if (NO_AUTH) {
    return noAuthLogin({ actionLoginSuccess });
  }

  return axios
    .post(BACKEND + "auth/login", { username, password }, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
      return true;
    })
    .catch(() => {
      actionLoginFail();
      return false;
    });
}

export function logout({ actionLoginFail, access_token }) {
  if (NO_AUTH) {
    return noAuthLogout({ actionLoginFail });
  }

  axios
    .post(BACKEND + "api/auth/logout", null, tokenConfig(access_token))
    .then(() => {
      actionLoginFail();
    })
    .catch(() => {
      actionLoginFail();
    });
}

export function register({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) {
  if (NO_AUTH) {
    return noAuthRegister({ actionLoginSuccess });
  }

  axios
    .post(BACKEND + "auth/register", { username, password }, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
    })
    .catch(() => {
      actionLoginFail();
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
