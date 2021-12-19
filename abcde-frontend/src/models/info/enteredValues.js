import { action } from "easy-peasy";

const enteredValues = {
  x: {},

  setEnteredValue: action((state, payload) => {
    const { enteredValueId, value } = payload;
    state.x[enteredValueId] = value;
  }),
};

export default enteredValues;
