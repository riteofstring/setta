import { action } from "easy-peasy";

const auth = {
  access_token: localStorage.getItem("access_token"),
  isAuthenticated: false,
  isNewSession: true,

  loginSuccess: action((state, payload) => {
    localStorage.setItem("access_token", payload.access_token);
    state.access_token = payload.access_token;
    state.isAuthenticated = true;
    state.isNewSession = true;
  }),

  loginFail: action((state) => {
    console.log("loginFail");
    localStorage.clear();
    sessionStorage.clear();
    state.access_token = null;
    state.isAuthenticated = false;
  }),

  stayLoggedIn: action((state) => {
    state.isAuthenticated = true;
    state.isNewSession = false;
  }),
};

export default auth;
