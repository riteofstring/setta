import { newEV } from "abcde-utils/src/objs/ev";
import { EVStateType, EVZustandType } from "abcde-utils/src/types/ev";
import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

const initialState: EVStateType = { x: {}, version: 0 };

export const useEnteredValues = createProjectState(
  temporal(
    immer<EVZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
      },
      initManyEnteredValues: ({ evIdsToUITypes }) =>
        set((state) => {
          _.forEach(
            evIdsToUITypes,
            (uiType, id) => (state.x[id] = newEV({ id, uiType }))
          );
        }),
      setEnteredValue: ({ enteredValueId, value }) =>
        set((state) => {
          state.x[enteredValueId].value = value;
        }),
      setChildId: ({ enteredValueId, childId }) =>
        set((state) => {
          state.x[enteredValueId].childId = childId;
        }),
    }))
  )
);

useEnteredValues.temporal.getState().pause();
