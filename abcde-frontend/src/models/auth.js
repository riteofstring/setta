import { action } from "easy-peasy";

const auth = {
  token: localStorage.getItem("token"),
  isAuthenticated: false,
  user: null,
  isNewSession: true,

  loginSuccess: action((state, payload) => {
    localStorage.setItem("token", payload.token);
    state.token = payload.token;
    state.user = payload.user;
    state.isAuthenticated = true;
    state.isNewSession = true;
  }),

  loginFail: action((state) => {
    console.log("loginFail");
    localStorage.clear();
    sessionStorage.clear();
    state.token = null;
    state.isAuthenticated = false;
    state.user = null;
  }),

  stayLoggedIn: action((state, payload) => {
    console.log("verified existing token", payload);
    state.isAuthenticated = true;
    state.user = payload.user;
    state.isNewSession = false;
  }),
};

export default auth;
