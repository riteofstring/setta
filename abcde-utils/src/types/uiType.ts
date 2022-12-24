import { ManyOf } from "./utils";

export type UITypeType = {
  id: string;
  type: string;
  name: string;
  config: UITypeConfigType;
  presetType: PresetType | null;
  originInfoId: OriginInfoIdType;
  isForChildOfOriginInfoId: boolean;
};

export type SectionUITypeType = UITypeType & {
  config: SectionUITypeConfigType;
};

export type UITypeConfigType =
  | EmptyUITypeConfigType
  | SectionUITypeConfigType
  | SliderUITypeConfigType;

export type EmptyUITypeConfigType = {};

export type SliderUITypeConfigType = { min: number; max: number; step: number };

export type SectionUITypeConfigType = {
  collections: string[];
  uiTypeColId: string;
  subType: string | null;
  childUITypeId: string | null;
};

export enum PresetType {
  BASE = "BASE",
  USER = "USER",
}

export type OriginInfoIdType = {
  sectionId: string | null;
  uiTypeColId: string | null;
  paramInfoId: string | null;
};

export type ManyUITypeType = ManyOf<UITypeType>;

export type ManySectionUITypeType = ManyOf<SectionUITypeType>;

export type UITypeStateType = {
  x: ManyUITypeType;
};

export type UITypeStateActionType = {
  resetAndSetAll: (payload: ManyUITypeType) => void;
  setUIType: (payload: { uiType: UITypeType }) => void;
  setConfig: (payload: {
    uiTypeId: string;
    newStateFn: (currConfig: UITypeConfigType) => UITypeConfigType;
  }) => void;
  setOneConfig: <T, K extends keyof T>(payload: {
    uiTypeId: string;
    configName: K;
    newValueFn: (currValue: T[K]) => T[K];
  }) => void;
  deleteUIType: (payload: { uiTypeId: string }) => void;
  setAll: (payload: UITypeStateType) => void;
  reset: () => void;
};

export type UITypeZustandType = UITypeStateType & UITypeStateActionType;
