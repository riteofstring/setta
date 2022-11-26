import { action, createStore } from "easy-peasy";
import activeSection from "models/activeSection";
import auth from "models/auth";
import currPage from "models/currPage";
import codeInfo from "models/info/codeInfo";
import enteredValues from "models/info/enteredValues";
import objInfos from "models/info/objInfos";
import paramInfos from "models/info/paramInfos";
import project from "models/info/project";
import projectConfig from "models/info/projectConfig";
import projectToLoad from "models/info/projectToLoad";
import sectionConfigs from "models/info/sectionConfigs";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";
import master from "models/master";
import panes from "models/panes";
import projectParamDefaults from "models/projectDefaults/projectParamDefaults";
import sectionPositions from "models/sectionPositions";
import uiEditor from "models/uiEditor";
import userCodeInfoMaps from "models/userCodeInfoMaps";
import thunks from "thunks/thunks";

const store = createStore({
  master: master,
  codeInfo: codeInfo,
  auth: auth,
  panes: panes,
  sectionPositions: sectionPositions,
  sectionInfos: sectionInfos,
  sectionConfigs: sectionConfigs,
  objInfos: objInfos,
  paramInfos: paramInfos,
  enteredValues: enteredValues,
  uiTypes: uiTypes,
  userCodeInfoMaps: userCodeInfoMaps,
  uiEditor: uiEditor,
  projectParamDefaults: projectParamDefaults,
  currPage: currPage,
  project: project,
  projectConfig: projectConfig,
  projectToLoad: projectToLoad,
  activeSection: activeSection,
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
