import { createStore } from "easy-peasy";
import auth from "../models/auth";

const store = createStore({
  auth: auth,
});

export default store;
