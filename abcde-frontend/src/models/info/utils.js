export function setToDefault(state, firstId, secondId, newValueFn, attr = "x") {
  if (!(firstId in state[attr])) {
    state[attr][firstId] = {};
  }
  if (!(secondId in state[attr][firstId])) {
    state[attr][firstId][secondId] = newValueFn();
  }
  return state[attr][firstId][secondId];
}
