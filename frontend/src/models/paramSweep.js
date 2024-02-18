import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {},
  version: 0,
};

export const useParamSweep = createProjectState(
  temporal(
    immer((set, get) => ({
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
          const sweep = state.x[paramSweepId].sweep[idx];
          sweep.values = sweep.values.filter((x, idx) => idx !== valueIdx);
          if (sweep.values.length === 0) {
            state.x[paramSweepId].sweep = state.x[paramSweepId].sweep.filter(
              (x, i) => i !== idx,
            );
          }
        }),
      deleteLastValue: ({ paramSweepId, idx }) => {
        const { deleteValue, x } = get();
        deleteValue({
          paramSweepId,
          idx,
          valueIdx: x[paramSweepId].sweep[idx].values.length - 1,
        });
      },
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
