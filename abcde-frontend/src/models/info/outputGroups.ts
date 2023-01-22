import {
  OutputGroupStateType,
  OutputGroupZustandType,
} from "abcde-utils/src/types/outputGroup";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

const initialState: OutputGroupStateType = { x: {} };

export const useOutputGroups = create(
  immer<OutputGroupZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
