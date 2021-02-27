import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";
import devPage from "../models/devPage";
import auth from "../models/auth";
import uiInfo from "../models/uiInfo"

const store = createStore({
  master: master,
  globalCurr: globalCurr,
  devPage: devPage,
  auth: auth,
  uiInfo: uiInfo
});

export default store;
