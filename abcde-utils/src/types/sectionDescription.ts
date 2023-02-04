import { ManyOf } from "./utils";

export type SectionDescriptionType = {
  value: string;
  height: number;
};

export type ManySectionDescriptionType = ManyOf<SectionDescriptionType>;

export type SectionDescriptionStateType = { x: ManySectionDescriptionType };

export type SectionDescriptionActionType = {
  resetAndSetAll: (payload: ManySectionDescriptionType) => void;
  initDescription: (payload: { sectionId: string }) => void;
  setDescription: (payload: { sectionId: string; value: string }) => void;
  setHeight: (payload: { sectionId: string; height: number }) => void;
  setAll: (payload: SectionDescriptionStateType) => void;
  reset: () => void;
};

export type SectionDescriptionZustandType = SectionDescriptionStateType &
  SectionDescriptionActionType;
