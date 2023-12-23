import { ManyOf } from "./utils";

export type EVColType = {
  name: string;
  values: { [codeInfoId: string]: string };
};

export type ManyEVColType = ManyOf<EVColType>;
