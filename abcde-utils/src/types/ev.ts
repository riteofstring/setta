import { ManyOf } from "./utils";

export type EVType = boolean | number | string | null;

export type ManyEVType = ManyOf<EVType>;

export type EVStateType = {
  x: ManyEVType;
  version: number;
};

export type EVActionType = {
  resetAndSetAll: (payload: ManyEVType) => void;
  initManyEnteredValues: (payload: { evIdsToUITypes: ManyOf<string> }) => void;
  setEnteredValue: (payload: { enteredValueId: string; value: EVType }) => void;
};

export type EVZustandType = EVStateType & EVActionType;
