import { action } from "easy-peasy";

import { NO_AUTH } from "../utils/constants";

const auth = {
  token: localStorage.getItem("token"),
  websocketToken: localStorage.getItem("websocketToken"),
  isAuthenticated: NO_AUTH,
  user: null,

  loginSuccess: action((state, payload) => {
    localStorage.setItem("token", payload.token);
    state.token = payload.token;
    state.user = payload.user;
    state.isAuthenticated = true;
  }),

  loginFail: action((state, payload) => {
    localStorage.clear();
    state.token = null;
    state.websocketToken = null;
    state.isAuthenticated = false;
    state.user = null;
    state.cliSocket = null;
  }),

  websocketTokenRetrievalSuccess: action((state, payload) => {
    localStorage.setItem("websocketToken", payload.token);
    state.websocketToken = payload.token;
  }),

  websocketTokenRetrievalFail: action((state) => {
    localStorage.removeItem("websocketToken");
    state.websocketToken = null;
  }),

  stayLoggedIn: action((state, payload) => {
    console.log("verified existing token", payload);
    state.isAuthenticated = true;
    state.user = payload.user;
  }),
};

export default auth;
