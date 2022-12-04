import { action, createStore } from "easy-peasy";
import projectConfigCodeInfoMaps from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import userCodeInfoMaps from "models/codeInfoMaps/userCodeInfoMaps";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";
import master from "models/master";
import thunks from "thunks/thunks";

const store = createStore({
  master: master,
  sectionInfos: sectionInfos,
  uiTypes: uiTypes,
  userCodeInfoMaps: userCodeInfoMaps,
  projectConfigCodeInfoMaps: projectConfigCodeInfoMaps,
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
