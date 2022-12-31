export function setToDefault(state, id) {
  if (!(id in state)) {
    state[id] = {};
  }
  return state[id];
}
