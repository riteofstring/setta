import { ManyOf } from "./utils";

export type KwargColType = {
  [codeInfoId: string]: string[];
};

export type ManyKwargColType = ManyOf<KwargColType>;

export type KwargColStateType = { x: ManyKwargColType; version: number };

export type KwargColActionType = {
  resetAndSetAll: (payload: ManyKwargColType) => void;

  initManyKwargColIds: (payload: { collectionIds: string[] }) => void;

  setKwargIds: (payload: {
    collectionId: string;
    objInfoId: string;
    newStateFn: (currIds: string[]) => string[];
  }) => void;
};

export type KwargColZustandType = KwargColStateType & KwargColActionType;
