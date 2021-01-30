import { createStore } from "easy-peasy";
import auth from "../models/auth";
import code from "../models/code";

const store = createStore({
  auth: auth,
  code: code,
});

export default store;
