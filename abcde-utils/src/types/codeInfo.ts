import { ManyOf } from "./utils";

export type CodeInfoType = {
  id: string;
  name: string;
  version: string | null;
  defaultVal: string | null;
  type: string;
  description: string | null;
  rcType: RCType;
  inCodeParentId: string | null;
  path: string;
  children: string[];
  returnTypeId: string | null;
};

export enum RCType {
  COLLECTION = "collection",
  CALLABLE = "callable",
  PARAMETER = "parameter",
}

export type ManyCodeInfoType = ManyOf<CodeInfoType>;
export type ManyCollectionsType = ManyOf<CodeInfoType>;
export type ManyCallablesType = ManyOf<CodeInfoType[]>;
export type ManyParamsType = ManyOf<CodeInfoType[]>;
export type ManyParamCollectionsType = ManyOf<CodeInfoType[]>;

export type CodeInfoStateType = {
  allCodeInfo: ManyCodeInfoType;
  version: number;
};

export type CodeInfoActionTypes = {
  resetAndSetAll: (payload: CodeInfoStateType) => void;
  setCodeInfo: (payload: { info: CodeInfoType }) => void;
  setName: (payload: { id: string; name: string }) => void;
  deleteInfos: (payload: { ids: string[] }) => void;
  updateInfos: (payload: CodeInfoStateType) => void;
};

export type CodeInfoZustandType = CodeInfoStateType & CodeInfoActionTypes;
