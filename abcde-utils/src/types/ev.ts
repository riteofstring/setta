import { ManyOf } from "./utils";

export type EVType = {
  id: string;
  value: boolean | number | string | null;
  childId: string | null;
};

export type ManyEVType = ManyOf<EVType>;

export type EVStateType = {
  x: ManyEVType;
  version: number;
};

export type EVActionType = {
  resetAndSetAll: (payload: ManyEVType) => void;
  initManyEnteredValues: (payload: { evIdsToUITypes: ManyOf<string> }) => void;
  setEnteredValue: (payload: {
    enteredValueId: string;
    value: EVType["value"];
  }) => void;
  setChildId: (payload: {
    enteredValueId: string;
    childId: EVType["childId"];
  }) => void;
};

export type EVZustandType = EVStateType & EVActionType;
