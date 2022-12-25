export type CodeInfoMapType = {
  [codeInfoId: string]: {
    uiTypeId: string;
  };
};

export type CodeInfoTypeMapType = {
  [codeInfoType: string]: {
    uiTypeId: string;
  };
};

export type CodeInfoMapStateType = {
  codeInfoMaps: CodeInfoMapType;
  codeInfoTypeMaps: CodeInfoTypeMapType;
};

export type CodeInfoMapActionType = {
  resetAndSetAll: (payload: CodeInfoMapStateType) => void;
  setAll: (payload: CodeInfoMapStateType) => void;
  reset: () => void;
  exportForDb: () => CodeInfoMapStateType;
};

export type CodeInfoMapZustandType = CodeInfoMapStateType &
  CodeInfoMapActionType;
