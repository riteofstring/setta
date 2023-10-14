import { ManyOf } from "./utils";

export type OutputGroupType = {
  id: string;
  name: string;
  children: string[];
};

export type ManyOutputGroupType = ManyOf<OutputGroupType>;

export type OutputGroupStateType = {
  x: ManyOutputGroupType;
};

export type OutputGroupActionType = {
  resetAndSetAll: (payload: ManyOutputGroupType) => void;
  addChildren: (payload: {
    id: string;
    name: string;
    children: string[];
  }) => void;
  setAll: (payload: OutputGroupStateType) => void;
  reset: () => void;
};

export type OutputGroupZustandType = OutputGroupStateType &
  OutputGroupActionType;
