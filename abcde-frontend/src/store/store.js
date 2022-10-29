import { action, createStore } from "easy-peasy";
import auth from "models/auth";
import currPage from "models/currPage";
import globalParamDefaults from "models/globalDefaults/globalParamDefaults";
import codeInfo from "models/info/codeInfo";
import enteredValues from "models/info/enteredValues";
import objInfos from "models/info/objInfos";
import paramInfos from "models/info/paramInfos";
import project from "models/info/project";
import projectConfig from "models/info/projectConfig";
import sectionConfigs from "models/info/sectionConfigs";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";
import master from "models/master";
import panes from "models/panes";
import projectParamDefaults from "models/projectDefaults/projectParamDefaults";
import sectionPositions from "models/sectionPositions";
import uiEditor from "models/uiEditor";
import uiInfo from "models/uiInfo";
import userSettings from "models/userSettings";
import thunks from "thunks/thunks";

const store = createStore({
  master: master,
  codeInfo: codeInfo,
  auth: auth,
  uiInfo: uiInfo,
  panes: panes,
  sectionPositions: sectionPositions,
  sectionInfos: sectionInfos,
  sectionConfigs: sectionConfigs,
  objInfos: objInfos,
  paramInfos: paramInfos,
  enteredValues: enteredValues,
  uiTypes: uiTypes,
  userSettings: userSettings,
  uiEditor: uiEditor,
  projectParamDefaults: projectParamDefaults,
  globalParamDefaults: globalParamDefaults,
  currPage: currPage,
  project: project,
  projectConfig: projectConfig,
  thunks: thunks,
  setState: action((state, payload) => payload),
  setSubState: action((state, payload) => {
    const { name, value } = payload;
    state[name] = value;
  }),
});

const initialState = store.getState();

export const resetEntireState = () => {
  store.dispatch.setState(initialState);
  store.persist.clear();
};

export default store;
