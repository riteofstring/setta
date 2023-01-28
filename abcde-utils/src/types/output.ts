import { ManyOf } from "./utils";

export type OutputType = {
  [key: string]: number[];
};

export type ManyOutputType = ManyOf<OutputType>;

export type OutputStateType = {
  x: ManyOutputType;
};

export type OutputActionType = {
  resetAndSetAll: (payload: ManyOutputType) => void;
  appendValue: (payload: { group: string; key: string; value: number }) => void;
  setAll: (payload: OutputStateType) => void;
  reset: () => void;
};

export type OutputZustandType = OutputStateType & OutputActionType;
