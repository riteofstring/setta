import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurr from "../models/globalCurr";
import devPage from "../models/devPage";
import auth from "../models/auth";

const store = createStore({
  master: master,
  globalCurr: globalCurr,
  devPage: devPage,
  auth: auth
});

export default store;
