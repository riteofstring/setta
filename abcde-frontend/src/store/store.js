import { createStore } from "easy-peasy";
import master from "../models/master";
import globalCurrObj from "../models/globalCurrObj";

const store = createStore({ master: master, globalCurrObj: globalCurrObj });

export default store;
