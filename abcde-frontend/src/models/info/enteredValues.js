import { EVInfo } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function getEVInfo(state, evId) {
  if (!(evId in state.x)) {
    state.x[evId] = new EVInfo({ id: evId });
  }
  return state.x[evId];
}

function getInitialState() {
  return { x: {} };
}

const enteredValues = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    const evs = _.mapValues(payload, (v, k) => new EVInfo({ id: k, ...v }));
    actions.reset();
    actions.setAll(evs);
  }),

  setAll: action((state, payload) => {
    state.x = payload;
  }),

  setEnteredValue: action((state, payload) => {
    const { enteredValueId, value } = payload;
    getEVInfo(state, enteredValueId).value = value;
  }),

  setChildId: action((state, payload) => {
    const { enteredValueId, childId } = payload;
    getEVInfo(state, enteredValueId).childId = childId;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default enteredValues;
