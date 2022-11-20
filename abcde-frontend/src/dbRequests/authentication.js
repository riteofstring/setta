import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";

export function accessPage({
  address,
  access_token,
  actionStayLoggedIn,
  actionLoginFail,
}) {
  if (NO_AUTH) {
    actionStayLoggedIn();
    return true;
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

// LOGIN USER
export const login = ({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) => {
  if (NO_AUTH) {
    actionLoginSuccess({ user: "user", access_token: "12345" });
    return true;
  }

  const body = JSON.stringify({ username, password });
  return axios
    .post(BACKEND + "auth/login", body, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
      return true;
    })
    .catch(() => {
      actionLoginFail();
      return false;
    });
};

// LOGIN USER
export const logout = ({ actionLoginFail, access_token }) => {
  if (NO_AUTH) {
    actionLoginFail(null);
    return;
  }
  axios
    .post(BACKEND + "api/auth/logout", null, tokenConfig(access_token))
    .then(() => {
      actionLoginFail();
    })
    .catch(() => {
      actionLoginFail();
    });
};

// REGISTER USER
export const register = ({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) => {
  console.log("attempting register");
  const body = JSON.stringify({ username, password });
  axios
    .post(BACKEND + "auth/register", body, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
    })
    .catch(() => {
      actionLoginFail();
    });
};

export const tokenConfig = (access_token) => {
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
};
