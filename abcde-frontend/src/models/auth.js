import { action } from "easy-peasy";
import { NO_AUTH } from "../utils/constants";
import { getCLISocket } from "../utils/websocket"

const auth = {
  token: localStorage.getItem('token'),
  isAuthenticated: NO_AUTH,
  user: null,
  cliSocket: null,

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
    state.cliSocket = getCLISocket(payload.token)
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