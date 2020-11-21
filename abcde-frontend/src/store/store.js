import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurrObj from "../models/globalCurrObj";
import globalCurrParams from "../models/globalCurrParams";
import globalCurrModule from "../models/globalCurrModule";
import globalCurrSection from "../models/globalCurrSection";

const store = createStore({
  master: master,
  globalCurrObj: globalCurrObj,
  globalCurrParams: globalCurrParams,
  globalCurrModule: globalCurrModule,
  globalCurrSection: globalCurrSection,
});

export default store;
