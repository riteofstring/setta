import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";

const store = createStore({
  master: master,
  globalCurr: globalCurr,
});

export default store;
