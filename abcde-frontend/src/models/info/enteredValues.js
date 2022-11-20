import { EVInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";
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
