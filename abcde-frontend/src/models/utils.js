import _ from "lodash";

export function resetState(state, initialState) {
  _.forEach(initialState, (v, k) => (state[k] = v));
}
