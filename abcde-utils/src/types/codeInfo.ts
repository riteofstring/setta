import { ManyOf } from "./utils";

export type CodeInfoType = {
  id: string;
  name: string;
  editable: boolean;
  children: string[];
};

export type ManyCodeInfoType = ManyOf<CodeInfoType>;
export type ManyCollectionsType = ManyOf<CodeInfoType>;
export type ManyCallablesType = ManyOf<CodeInfoType[]>;
export type ManyParamsType = ManyOf<CodeInfoType[]>;
export type ManyParamCollectionsType = ManyOf<CodeInfoType[]>;

export type CodeInfoStateFrontendType = ManyCodeInfoType & { version: number };

export type CodeInfoActionTypes = {
  resetAndSetAll: (payload: ManyCodeInfoType) => void;
  setCodeInfo: (payload: { info: CodeInfoType }) => void;
  setName: (payload: { id: string; name: string }) => void;
  deleteInfos: (payload: { ids: string[] }) => void;
  update: (payload: ManyCodeInfoType) => void;
};

export type CodeInfoZustandType = CodeInfoStateFrontendType &
  CodeInfoActionTypes;
