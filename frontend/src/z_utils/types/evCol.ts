import { ManyOf } from "./utils";

export type EVColType = {
  [codeInfoId: string]: string;
};

export type ManyEVColType = ManyOf<EVColType>;
