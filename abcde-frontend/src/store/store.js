import { createStore, action, debug } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";
import yamlEntry from "../models/yamlEntry";
import auth from "../models/auth";
import uiInfo from "../models/uiInfo";
import factoriesInfo from "../models/factoriesInfo";
import funcsInfo from "../models/funcsInfo";
import panes from "../models/panes";
import mapInteraction from "../models/mapInteraction";
import cliSocket from "../models/cliSocket";

const store = createStore({
  master: master,
  globalCurr: globalCurr,
  yamlEntry: yamlEntry,
  auth: auth,
  uiInfo: uiInfo,
  factoriesInfo: factoriesInfo,
  funcsInfo: funcsInfo,
  panes: panes,
  mapInteraction: mapInteraction,
  cliSocket: cliSocket,
  setState: action((state, payload) => payload),
  setSubState: action((state, payload) => {
    const { name, value } = payload;
    state[name] = value;
  }),
});

const initialState = store.getState();

export const resetEntireState = () => {
  store.dispatch.setState(initialState);
};

export const resetState = (name) => {
  store.dispatch.setSubState({ name, value: initialState[name]});
};

export default store;
