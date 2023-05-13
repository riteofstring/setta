import {
  CodeInfoMapStateType,
  CodeInfoMapZustandType,
} from "abcde-utils/src/types/codeInfoMap";

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
