import { SizeType } from "./size";
import { UITypeType } from "./uiType";
import { ManyOf } from "./utils";

export type SectionType = {
  id: string;
  name: string;
  children: string[];
  size: SizeType;
  chainedFrom: string | null;
  uiTypeId: string;
  evColId: string;
  uiTypeColId: string;
  paramSweepId: string | null;
  selectedItem: string | null;
  social: string | null;
  outputGroup: string | null;
  description: string;
  descriptionHeight: number;
  descriptionVisible: boolean;
  evColIds: string[];
  nonPresetUITypeIds: string[];
  script: string;
  code: string;
  varControl: string;
  isFrozen: boolean;
};

export type ManySectionType = ManyOf<SectionType>;
export type ManySectionChildrenType = ManyOf<string[]>;

export type SectionTypeSaveProjectToBackend = SectionType;
export type ManySectionTypeSaveProjectToBackend =
  ManyOf<SectionTypeSaveProjectToBackend>;

export type SectionInfoStateType = {
  x: ManySectionType;
  version: number;
};

export type SectionInfoActionType = {
  resetAndSetAll: (payload: { sections: ManySectionType }) => void;

  setSectionInfo: (
    newStateFn: (currState: ManySectionType) => ManySectionType
  ) => void;

  setSectionInfoAttr: <K extends keyof SectionType>(payload: {
    sectionId?: string;
    sectionIds?: string[];
    attr: K;
    value?: SectionType[K];
    newValueFn?: any;
  }) => void;

  setSectionInfoAttrObjInput: (payload: {
    newValues: { [id: string]: Partial<SectionType> };
  }) => void;

  setAllChildren: (payload: {
    sectionId: string;
    newStateFn: (currState: string[]) => string[];
  }) => void;

  setChildrenNames: (payload: {
    sectionType: UITypeType;
    sectionId: string;
  }) => void;

  removeSectionInfos: (payload: string[]) => void;
};

export type SectionInfoZustandType = SectionInfoStateType &
  SectionInfoActionType;
