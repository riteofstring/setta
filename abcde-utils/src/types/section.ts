import { SectionPositionType } from "./sectionPosition";
import { SizeType } from "./size";
import { ManyOf } from "./utils";

export type SectionType = {
  id: string;
  name: string;
  children: string[];
  currChildren: string[];
  parentId: string | null;
  paramInfoId: string | null;
  size: SizeType;
  initialPosition: SectionPositionType;
  chainedFrom: string | null;
  zIndex: number;
  uiTypeId: string;
  evColId: string;
  kwargColId: string;
  uiTypeColId: string;
  selectedItem: string;
  social: string | null;
  outputGroup: string | null;
  userSpecifiedObjectId: string | null;
  description: string;
  descriptionHeight: number;
  descriptionVisible: boolean;
};

export type ManySectionType = ManyOf<SectionType>;

export type SectionTypeSaveProjectToBackend = Omit<SectionType, "parentId">;
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

  setCurrChildrenNames: (payload: {
    currChildren: string[];
    sectionType: any;
  }) => void;

  setCurrChildren: (payload: {
    sectionId: string;
    currChildren: string[];
  }) => void;

  removeSectionInfos: (payload: string[]) => void;
};

export type SectionInfoZustandType = SectionInfoStateType &
  SectionInfoActionType;
