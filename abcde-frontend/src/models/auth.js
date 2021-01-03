import { action } from "easy-peasy";

const auth = {
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  user: null,

  loginSuccess: action((state, payload) => {
    console.log("LOGIN SUCCESS");
    console.log("payload.token");
    console.log(payload.token);
    localStorage.setItem("token", payload.token);
    state.token = payload.token;
    console.log("state.token");
    console.log(state.token);
    state.user = payload.user;
    console.log("user", state.user)
    state.isAuthenticated = true;
  }),

  loginFail: action((state, payload) => {
    console.log("LOGIN FAIL");
    localStorage.removeItem("token");
    state.token = null;
    state.user = null;
    state.isAuthenticated = false;
  }),
};

export default auth