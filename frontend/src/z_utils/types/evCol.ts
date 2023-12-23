import { ManyOf } from "./utils";

export type EVColType = {
  [objName: string]: { [paramName: string]: string };
};

export type ManyEVColType = ManyOf<EVColType>;
