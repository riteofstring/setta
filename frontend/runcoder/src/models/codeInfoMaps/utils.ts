import { immer } from "zustand/middleware/immer";
import {
  CodeInfoMapStateType,
  CodeInfoMapZustandType,
} from "z_utils/types/codeInfoMap";
import { create } from "../utils";

export const initialState: CodeInfoMapStateType = {
  x: {},
};

export function createCodeInfoMapState() {
  return create(
    immer<CodeInfoMapZustandType>((set, get) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        const s = get();
        s.reset();
        s.setAll(payload);
      },
      setAll: (payload) =>
        set((state) => {
          state.x = payload;
        }),
      reset: () => set(initialState),
      exportForDb: () => get().x,
    }))
  );
}
