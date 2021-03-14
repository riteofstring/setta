import { action, thunk } from "easy-peasy";

export const getCLISocket = (token) => {
  const ws_url = `ws://localhost:8000/ws/cli/?token=${token}&source=browser`;
  return new WebSocket(ws_url);
};

const cliSocket = {
  cliSocket: null,
  uiInfo: null,
  factories: null,
  funcs: null,

  setCLISocket: thunk((action, payload, helpers) => {
    const { token } = payload;
    helpers.getState().cliSocket = getCLISocket(token);
    helpers.getState().cliSocket.onmessage = function (event) {
      const data = JSON.parse(event.data);
      const { UI, FACTORIES, FUNCS } = JSON.parse(data["enteredText"]);
      action.setUiInfo(UI);
      action.setFactories(FACTORIES);
      action.setFuncs(FUNCS);
    };
  }),

  setUiInfo: action((state, payload) => {
    state.uiInfo = payload;
  }),

  setFactories: action((state, payload) => {
    state.factories = payload;
  }),

  setFuncs: action((state, payload) => {
    state.funcs = payload;
  }),
};

export default cliSocket;
