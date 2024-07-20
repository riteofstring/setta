import { ManyOf } from "./utils";

export type UITypeType = {
  id: string;
  type: string;
  name: string;
  config: UITypeConfigType;
  presetType: PresetType | null;
};

export type SectionUITypeType = Omit<UITypeType, "config"> & {
  config: SectionUITypeConfigType;
};

export type UITypeConfigType =
  | EmptyUITypeConfigType
  | SectionUITypeConfigType
  | SliderUITypeConfigType;

export type EmptyUITypeConfigType = {};

export type SliderUITypeConfigType = { min: number; max: number; step: number };

export type SectionUITypeConfigType = {
  codeInfoId: string;
  childUITypeId: string | null;
};

export enum PresetType {
  BASE = "BASE",
  USER = "USER",
}

export type ManyUITypeType = ManyOf<UITypeType>;

export type ManySectionUITypeType = ManyOf<SectionUITypeType>;

export type UITypeStateType = {
  x: ManyUITypeType;
  version: number;
};

export type NewValueFnType<T> = (currValue: T) => T;

export type UITypeSetOneConfigPayloadType<T> = {
  uiTypeId: string;
  configName: string;
  newValueFn: NewValueFnType<T>;
};

export type UITypeActionType = {
  resetAndSetAll: (payload: ManyUITypeType) => void;
  setUIType: (payload: { uiType: UITypeType }) => void;
  setConfig: (payload: {
    uiTypeId: string;
    newStateFn: (currConfig: UITypeConfigType) => UITypeConfigType;
  }) => void;
  setOneConfig: <T>(payload: UITypeSetOneConfigPayloadType<T>) => void;
  deleteUIType: (payload: { uiTypeId: string }) => void;
};

export type UITypeZustandType = UITypeStateType & UITypeActionType;
