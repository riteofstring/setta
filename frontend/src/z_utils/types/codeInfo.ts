import { ManyOf } from "./utils";

export type CodeInfoType = {
  id: string;
  name: string;
  editable: boolean;
  rcType: RCType;
  defaultVal: string | null;
  children: string[];
  description: string;
  isPinned: boolean;
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

export type CodeInfoStateFrontendType = { x: ManyCodeInfoType } & {
  version: number;
};

export type CodeInfoActionTypes = {
  resetAndSetAll: (payload: ManyCodeInfoType) => void;
  addCodeInfo: (payload: { info: CodeInfoType; parent?: string }) => void;
  setName: (payload: { id: string; name: string }) => void;
  deleteInfo: (payload: { id: string; parent?: string }) => void;
  update: (payload: ManyCodeInfoType) => void;
};

export type CodeInfoZustandType = CodeInfoStateFrontendType &
  CodeInfoActionTypes;
