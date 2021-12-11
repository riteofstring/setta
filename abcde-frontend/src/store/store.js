import { createStore, action } from "easy-peasy";

import auth from "../models/auth";
import cliSocket from "../models/cliSocket";
import factoriesInfo from "../models/factoriesInfo";
import funcsInfo from "../models/funcsInfo";
import kwargInfos from "../models/info/kwargInfos";
import objInfos from "../models/info/objInfos";
import paramInfos from "../models/info/paramInfos";
import sectionInfos from "../models/info/sectionInfos";
import sectionTypes from "../models/info/sectionTypes";
import uiTypeConfigs from "../models/info/uiTypeConfigs";
import uiTypes from "../models/info/uiTypes";
import mapInteraction from "../models/mapInteraction";
import master from "../models/master";
import panes from "../models/panes";
import sectionPositions from "../models/sectionPositions";
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
  sectionInfos: sectionInfos,
  sectionTypes: sectionTypes,
  objInfos: objInfos,
  paramInfos: paramInfos,
  kwargInfos: kwargInfos,
  uiTypes: uiTypes,
  uiTypeConfigs: uiTypeConfigs,
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
