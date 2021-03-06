import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";
import yamlEntry from "../models/yamlEntry";
import auth from "../models/auth";
import uiInfo from "../models/uiInfo";
import factoriesInfo from "../models/factoriesInfo";
import funcsInfo from "../models/funcsInfo";
import panes from "../models/panes";
import mapInteraction from "../models/mapInteraction";

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
});

export default store;
