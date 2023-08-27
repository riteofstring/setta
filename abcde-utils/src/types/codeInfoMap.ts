export type CodeInfoTypeMapType = {
  [codeInfoType: string]: {
    uiTypeId: string;
  };
};

export type CodeInfoMapStateType = { x: CodeInfoTypeMapType };

export type CodeInfoMapActionType = {
  resetAndSetAll: (payload: CodeInfoTypeMapType) => void;
  setAll: (payload: CodeInfoTypeMapType) => void;
  reset: () => void;
  exportForDb: () => CodeInfoTypeMapType;
};

export type CodeInfoMapZustandType = CodeInfoMapStateType &
  CodeInfoMapActionType;
