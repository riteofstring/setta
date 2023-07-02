import { ManyOf } from "./utils";

export type UITypeColType = {
  [codeInfoId: string]: string;
};

export type ManyUITypeColType = ManyOf<UITypeColType>;
