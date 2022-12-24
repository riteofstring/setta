export type EVType = {
  value: string | null;
  childId: string | null;
};

export type ManyEVType = {
  [id: string]: EVType;
};

export type EVStateType = {
  x: ManyEVType;
};

export type EVStateActionType = {
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

export type EVZustandType = EVStateType & EVStateActionType;
