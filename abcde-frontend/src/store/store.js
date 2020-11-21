import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurrObj from "../models/globalCurrObj";
import globalCurrParams from "../models/globalCurrParams";

const store = createStore({
  master: master,
  globalCurrObj: globalCurrObj,
  globalCurrParams: globalCurrParams,
});

export default store;
