import { ManyOf } from "./utils";

export type SectionConfigType = {
  id: string;
  uiTypeId: string;
  evColId: string;
  kwargColId: string;
  uiTypeColId: string;
  selectedItem: string;
  descriptionId: string;
};

export type ManySectionConfigType = ManyOf<SectionConfigType>;

export type SectionConfigStateType = {
  x: ManySectionConfigType;
};

export type SectionConfigActionType = {
  resetAndSetAll: (payload: ManySectionConfigType) => void;
  setSectionConfig: (
    newStateFn: (currState: ManySectionConfigType) => ManySectionConfigType
  ) => void;
  setSectionConfigAttr: (payload: {
    configId: keyof ManySectionConfigType;
    attr: keyof SectionConfigType;
    value: string;
  }) => void;
  setAll: (payload: SectionConfigStateType) => void;
  reset: () => void;
};

export type SectionConfigZustandType = SectionConfigStateType &
  SectionConfigActionType;
