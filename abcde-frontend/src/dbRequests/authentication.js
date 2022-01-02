import axios from "axios";

import { BACKEND, NO_AUTH } from "../utils/constants";

export const verifyToken = ({
  authToken,
  actionStayLoggedIn,
  actionLoginFail,
}) => {
  console.log("trying to verify existing token", authToken);
  if (NO_AUTH) {
    actionStayLoggedIn({ user: "user" });
    return true;
  }
  return axios
    .post(BACKEND + "api/auth/verifyToken", null, tokenConfig(authToken))
    .then((res) => {
      actionStayLoggedIn(res.data);
      return true;
    })
    .catch((err) => {
      actionLoginFail(null);
      return false;
    });
};

// LOGIN USER
export const login = ({
  username,
  password,
  actionLoginSuccess,
  actionLoginFail,
}) => {
  if (NO_AUTH) {
    actionLoginSuccess({ user: "user", token: "12345" });
    return true;
  }

  const body = JSON.stringify({ username, password });
  return axios
    .post(BACKEND + "api/auth/login", body, tokenConfig(null))
    .then((res) => {
      actionLoginSuccess(res.data);
      return true;
    })
    .catch((err) => {
      actionLoginFail(null);
      return false;
    });
};

// LOGIN USER
export const websocketAuth = ({
  authToken,
  actionWebsocketTokenRetrievalSuccess,
  actionWebsocketTokenRetrievalFail,
}) => {
  return axios
    .post(BACKEND + "api/auth/websocketAuth", null, tokenConfig(authToken))
    .then((res) => {
      actionWebsocketTokenRetrievalSuccess(res.data);
      return res.data.token;
    })
    .catch((err) => {
      actionWebsocketTokenRetrievalFail(null);
      return false;
    });
};

// LOGIN USER
export const logout = ({ actionLoginFail, authToken }) => {
  if (NO_AUTH) {
    actionLoginFail(null);
    return;
  }
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
