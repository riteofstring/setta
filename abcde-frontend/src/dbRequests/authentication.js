import axios from "axios";
import { BACKEND } from "../utils/constants";

// LOGIN USER
export const login = ({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) => {
  const body = JSON.stringify({ username, password });
  return axios
    .post(BACKEND + "api/auth/login", body, tokenConfig(null))
    .then((res) => actionLoginSuccess(res.data))
    .catch((err) => actionLoginFail(null));
};

// LOGIN USER
export const logout = ({ actionLoginFail, authToken }) => {
  axios
    .post(BACKEND + "api/auth/logout", null, tokenConfig(authToken))
    .then((res) => {
      actionLoginFail(null);
    })
    .catch((err) => {
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
    .catch((err) => {
      actionLoginFail(null);
    });
};

export const tokenConfig = (authToken) => {
  // Headers
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  // If token, add to headers config
  if (authToken) {
    config.headers["Authorization"] = `Token ${authToken}`;
  }

  return config;
};
