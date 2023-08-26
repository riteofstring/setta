export type CodeInfoTypeMapType = {
  [codeInfoType: string]: {
    uiTypeId: string;
  };
};

export type CodeInfoMapActionType = {
  resetAndSetAll: (payload: CodeInfoTypeMapType) => void;
  setAll: (payload: CodeInfoTypeMapType) => void;
  reset: () => void;
  exportForDb: () => CodeInfoTypeMapType;
};

export type CodeInfoMapZustandType = CodeInfoTypeMapType &
  CodeInfoMapActionType;
