import { ManyOf } from "./utils";

export type RunType = {
  id: string;
  name: string;
  code: string;
  outputGroups: string[];
};

export type ManyRunType = ManyOf<RunType>;
