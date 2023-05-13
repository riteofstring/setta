import { newEV } from "abcde-utils/src/objs/ev";
import { EVStateType, EVZustandType } from "abcde-utils/src/types/ev";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

function getEVInfo(state: EVZustandType, evId: string) {
  if (!(evId in state.x)) {
    state.x[evId] = newEV({ id: evId, value: null, childId: null });
  }
  return state.x[evId];
}

const initialState: EVStateType = { x: {}, version: 0 };

export const useEnteredValues = createProjectState(
  temporal(
    immer<EVZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
      },
      initManyEnteredValues: ({ enteredValueIds }) =>
        set((state) => {
          enteredValueIds.forEach((id) => (getEVInfo(state, id).value = null));
        }),
      setEnteredValue: ({ enteredValueId, value }) =>
        set((state) => {
          getEVInfo(state, enteredValueId).value = value;
        }),
      setChildId: ({ enteredValueId, childId }) =>
        set((state) => {
          getEVInfo(state, enteredValueId).childId = childId;
        }),
    }))
  )
);

useEnteredValues.temporal.getState().pause();
