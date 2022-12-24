import { ManyOf } from "./utils";

export type KwargColType = {
  [codeInfoId: string]: string[];
};

export type ManyKwargColType = ManyOf<KwargColType>;

export type KwargColStateType = { x: ManyKwargColType };

export type KwargColActionType = {
  resetAndSetAll: (payload: ManyKwargColType) => void;

  setKwargIds: (payload: {
    collectionId: string;
    objInfoId: string;
    newStateFn: (currIds: string[]) => string[];
  }) => void;

  setAll: (payload: KwargColStateType) => void;

  reset: () => void;
};

export type KwargColZustandType = KwargColStateType & KwargColActionType;
