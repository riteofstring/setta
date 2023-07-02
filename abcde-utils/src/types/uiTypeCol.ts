import { ManyOf } from "./utils";

export type UITypeColType = {
  [codeInfoId: string]: { uiTypeId: string; nonPresetUITypeIds: string[] };
};

export type ManyUITypeColType = ManyOf<UITypeColType>;
