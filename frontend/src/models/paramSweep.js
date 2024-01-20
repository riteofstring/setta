import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {
    "39e067ec-8392-4e83-86b7-010f60f5abce": [
      {
        paramInfoId: "159e0416-3873-469b-915b-1f186579c380",
        values: ["100", "200", "300"],
      },
      {
        paramInfoId: "2fae73d3-5756-42a9-beb0-7465b92ac626",
        values: ["True", "False"],
      },
    ],
  },
  version: 0,
};

export const useParamSweep = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      setValue: ({ paramSweepId, idx, valueIdx, value }) =>
        set((state) => {
          state.x[paramSweepId][idx].values[valueIdx] = value;
        }),
      addValue: ({ paramSweepId, idx }) =>
        set((state) => {
          state.x[paramSweepId][idx].values.push("");
        }),
      deleteValue: ({ paramSweepId, idx, valueIdx }) =>
        set((state) => {
          state.x[paramSweepId][idx].values = state.x[paramSweepId][
            idx
          ].values.filter((x, idx) => idx !== valueIdx);
        }),
      deleteLastValue: ({ paramSweepId, idx }) =>
        set((state) => {
          state.x[paramSweepId][idx].values = state.x[paramSweepId][
            idx
          ].values.slice(0, -1);
        }),
    }))
  )
);

useParamSweep.temporal.getState().pause();
