import { createStore, action } from "easy-peasy";
import master from "../models/master";
import yamlEntry from "../models/yamlEntry";
import auth from "../models/auth";
import uiInfo from "../models/uiInfo";
import factoriesInfo from "../models/factoriesInfo";
import funcsInfo from "../models/funcsInfo";
import panes from "../models/panes";
import mapInteraction from "../models/mapInteraction";
import cliSocket from "../models/cliSocket";
import sectionPositions from "../models/sectionPositions";
import currentlySelected from "../models/currentlySelected";
import parameterDetailsStoreCreator from "../models/parameterDetailsStoreCreator";

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
  currentlySelected: currentlySelected,
  globalCurr: parameterDetailsStoreCreator("globalCurr", ["paramValue"]),
  savedKwargs: parameterDetailsStoreCreator("savedKwargs", ["exists"]),
  uiTypes: parameterDetailsStoreCreator("uiTypes", ["uiType"]),
  nestedSectionIds: parameterDetailsStoreCreator("nestedSectionIds", [
    "nestedSectionId",
  ]),
  uiTypeConfigs: parameterDetailsStoreCreator("uiTypeConfigs", [
    "uiType",
    "uiConfigOption",
    "uiConfigValue",
  ]),
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
