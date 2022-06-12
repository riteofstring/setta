import { createStore, action, persist } from "easy-peasy";
import auth from "models/auth";
import cliSocket from "models/cliSocket";
import factoriesInfo from "models/factoriesInfo";
import funcsInfo from "models/funcsInfo";
import globalParamDefaults from "models/globalDefaults/globalParamDefaults";
import enteredValues from "models/info/enteredValues";
import kwargInfos from "models/info/kwargInfos";
import objInfos from "models/info/objInfos";
import paramInfos from "models/info/paramInfos";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";
import master from "models/master";
import panes from "models/panes";
import projectParamDefaults from "models/projectDefaults/projectParamDefaults";
import sectionPositions from "models/sectionPositions";
import uiEditor from "models/uiEditor";
import uiInfo from "models/uiInfo";
import userSettings from "models/userSettings";
import yamlEntry from "models/yamlEntry";

const store = createStore(
  persist(
    {
      master: master,
      yamlEntry: yamlEntry,
      auth: auth,
      uiInfo: uiInfo,
      factoriesInfo: factoriesInfo,
      funcsInfo: funcsInfo,
      panes: panes,
      cliSocket: cliSocket,
      sectionPositions: sectionPositions,
      sectionInfos: sectionInfos,
      objInfos: objInfos,
      paramInfos: paramInfos,
      kwargInfos: kwargInfos,
      enteredValues: enteredValues,
      uiTypes: uiTypes,
      userSettings: userSettings,
      uiEditor: uiEditor,
      projectParamDefaults: projectParamDefaults,
      globalParamDefaults: globalParamDefaults,
      setState: action((state, payload) => payload),
      setSubState: action((state, payload) => {
        const { name, value } = payload;
        state[name] = value;
      }),
    },
    {
      deny: ["auth", "setState", "setSubState"],
      storage: "localStorage",
    }
  )
);

const initialState = store.getState();

export const resetEntireState = () => {
  store.dispatch.setState(initialState);
  store.persist.clear();
};

export const resetState = (name) => {
  store.dispatch.setSubState({ name, value: initialState[name] });
};

export default store;
