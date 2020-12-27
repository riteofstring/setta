import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";
import devPage from "../models/devPage";

const store = createStore({
  master: master,
  globalCurr: globalCurr,
  devPage: devPage,
});

export default store;
