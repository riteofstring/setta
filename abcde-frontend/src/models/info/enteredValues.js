import { EVInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";

function getEVInfo(state, evId) {
  if (!(evId in state.x)) {
    state.x[evId] = new EVInfo({ id: evId });
  }
  return state.x[evId];
}

const enteredValues = {
  x: {},

  setEnteredValue: action((state, payload) => {
    const { enteredValueId, value } = payload;
    getEVInfo(state, enteredValueId).value = value;
  }),

  setChildId: action((state, payload) => {
    const { enteredValueId, childId } = payload;
    getEVInfo(state, enteredValueId).childId = childId;
  }),
};

export default enteredValues;
