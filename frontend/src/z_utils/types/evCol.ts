import { ManyOf } from "./utils";

export type EVType = { type: string; value: string }[];

export type EVColType = {
  [codeInfoId: string]: EVType;
};

export type ManyEVColType = ManyOf<EVColType>;
