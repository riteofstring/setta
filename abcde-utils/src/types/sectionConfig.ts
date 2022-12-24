export type SectionConfigType = {
  id: string;
  uiTypeId: string;
  evColId: string;
  kwargColId: string;
  selectedItem: string | null;
};

export type ManySectionConfigType = {
  [id: string]: SectionConfigType;
};

export type SectionConfigStateType = {
  x: ManySectionConfigType;
};

export type SectionConfigStateActionType = {
  resetAndSetAll: (payload: SectionConfigStateType) => void;
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
  getAll: () => ManySectionConfigType;
};

export type SectionConfigZustandType = SectionConfigStateType &
  SectionConfigStateActionType;
