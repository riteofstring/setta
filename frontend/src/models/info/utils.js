export function initValue(state, id, value) {
  if (!(id in state)) {
    state[id] = value;
  }
  return state[id]
}
