import { createStore, action } from "easy-peasy";

import auth from "../models/auth";
import cliSocket from "../models/cliSocket";
import factoriesInfo from "../models/factoriesInfo";
import funcsInfo from "../models/funcsInfo";
import mapInteraction from "../models/mapInteraction";
import master from "../models/master";
import panes from "../models/panes";
import sectionPositions from "../models/sectionPositions";
import sections from "../models/sections";
import uiInfo from "../models/uiInfo";
import yamlEntry from "../models/yamlEntry";

const store = createStore({
  master: master,
  yamlEntry: yamlEntry,
  auth: auth,
  uiInfo: uiInfo,
  factoriesInfo: factoriesInfo,
  funcsInfo: funcsInfo,
  panes: panes,
  mapInteraction: mapInteraction,
  cliSocket: cliSocket,
  sectionPositions: sectionPositions,
  sections: sections,
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
  store.dispatch.setSubState({ name, value: initialState[name] });
};

export default store;
