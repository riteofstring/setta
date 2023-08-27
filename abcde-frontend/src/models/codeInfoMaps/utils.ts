import {
  CodeInfoMapStateType,
  CodeInfoMapZustandType,
} from "abcde-utils/src/types/codeInfoMap";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

export const initialState: CodeInfoMapStateType = {
  codeInfoMaps: {},
  codeInfoTypeMaps: {},
};

export function setAll(
  state: CodeInfoMapZustandType,
  payload: CodeInfoMapStateType
) {
  const { codeInfoMaps, codeInfoTypeMaps } = payload;
  state.codeInfoMaps = codeInfoMaps;
  state.codeInfoTypeMaps = codeInfoTypeMaps;
}

export function createCodeInfoMapState() {
  return create(
    immer<CodeInfoMapZustandType>((set, get) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        const s = get();
        s.reset();
        s.setAll(payload);
      },
      setAll: (payload) => set((state) => (state.x = payload)),
      reset: () => set(initialState),
      exportForDb: () => get().x,
    }))
  );
}
