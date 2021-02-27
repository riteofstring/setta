export const getAllNonFunctions = (x) => {
  return Object.fromEntries(
    Object.entries(x).filter(([key, value]) => !(value instanceof Function))
  );
};


export const setEntireState = (state, newState) => {
    for (let key of Object.keys(getAllNonFunctions(state))){
        console.log("setEntireState key", key)
        state[key] = newState[key]
    }
}