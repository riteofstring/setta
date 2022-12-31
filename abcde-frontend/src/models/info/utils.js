export function setToDefault(state, id) {
  if (!(id in state)) {
    state[id] = {};
  }
  return state[id];
}

export function initValue(state, id, value) {
  if (!(id in state)) {
    state[id] = value;
  }
}
