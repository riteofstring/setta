import { ManyOf } from "./utils";

export type SectionDescriptionType = {
  value: string;
  height: number;
  visible: boolean;
};

export type ManySectionDescriptionType = ManyOf<SectionDescriptionType>;

export type SectionDescriptionStateType = { x: ManySectionDescriptionType };

export type SectionDescriptionActionType = {
  resetAndSetAll: (payload: ManySectionDescriptionType) => void;
  initDescriptions: (payload: { descriptionIds: string[] }) => void;
  setDescription: (payload: { descriptionId: string; value: string }) => void;
  setHeight: (payload: { descriptionId: string; height: number }) => void;
  toggleVisible: (payload: { descriptionId: string }) => void;
  setAll: (payload: SectionDescriptionStateType) => void;
  reset: () => void;
};

export type SectionDescriptionZustandType = SectionDescriptionStateType &
  SectionDescriptionActionType;
