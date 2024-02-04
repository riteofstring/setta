import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {},
  version: 0,
};

export const useParamSweep = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => set({ x: payload }),
      initParamSweep: ({ id, name }) =>
        set((state) => {
          state.x[id] = { name: name, sweep: [] };
        }),
      setValue: ({ paramSweepId, idx, valueIdx, value }) =>
        set((state) => {
          state.x[paramSweepId].sweep[idx].values[valueIdx] = value;
        }),
      addValue: ({ paramSweepId, idx }) =>
        set((state) => {
          state.x[paramSweepId].sweep[idx].values.push("");
        }),
      deleteValue: ({ paramSweepId, idx, valueIdx }) =>
        set((state) => {
          state.x[paramSweepId].sweep[idx].values = state.x[paramSweepId].sweep[
            idx
          ].values.filter((x, idx) => idx !== valueIdx);
        }),
      deleteLastValue: ({ paramSweepId, idx }) =>
        set((state) => {
          state.x[paramSweepId].sweep[idx].values = state.x[paramSweepId].sweep[
            idx
          ].values.slice(0, -1);
        }),
      changeParamInfoId: ({ paramSweepId, idx, paramInfoId, evColId }) =>
        set((state) => {
          if (paramInfoId) {
            state.x[paramSweepId].sweep[idx] = { paramInfoId, values: [""] };
          } else if (evColId) {
            state.x[paramSweepId].sweep[idx] = { evColId };
          }
        }),
      addParamInfoId: ({ paramSweepId, paramInfoId, evColId }) =>
        set((state) => {
          if (paramInfoId) {
            state.x[paramSweepId].sweep.push({ paramInfoId, values: [""] });
          } else if (evColId) {
            state.x[paramSweepId].sweep.push({ evColId });
          }
        }),
    })),
  ),
);

useParamSweep.temporal.getState().pause();
