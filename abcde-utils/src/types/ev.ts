import { ManyOf } from "./utils";

export type EVType = {
  id: string;
  value: string | null;
  childId: string | null;
};

export type ManyEVType = ManyOf<EVType>;

export type EVStateType = {
  x: ManyEVType;
};

export type EVActionType = {
  resetAndSetAll: (payload: ManyEVType) => void;
  setEnteredValue: (payload: {
    enteredValueId: string;
    value: EVType["value"];
  }) => void;
  setChildId: (payload: {
    enteredValueId: string;
    childId: EVType["childId"];
  }) => void;
  setAll: (payload: EVStateType) => void;
  reset: () => void;
};

export type EVZustandType = EVStateType & EVActionType;
