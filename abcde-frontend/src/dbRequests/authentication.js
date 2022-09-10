import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";

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
      actionLoginFail(null);
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
      actionLoginFail(null);
    })
    .catch(() => {
      actionLoginFail(null);
    });
};

// REGISTER USER
export const register = ({
  username,
  email,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) => {
  console.log("attempting register");
  const body = JSON.stringify({ username, email, password });
  axios
    .post(BACKEND + "api/auth/register", body, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
    })
    .catch(() => {
      actionLoginFail(null);
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
    config.headers["Authorization"] = `Token ${access_token}`;
  }

  return config;
};
