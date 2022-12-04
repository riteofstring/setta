import { action, createStore } from "easy-peasy";
import thunks from "thunks/thunks";

const store = createStore({
  thunks: thunks,
  setState: action((state, payload) => payload),
  setSubState: action((state, payload) => {
    const { name, value } = payload;
    state[name] = value;
  }),
});

const initialState = store.getState();

export const resetEntireState = () => {
  store.dispatch.setState(initialState);
  store.persist.clear();
};

export default store;
