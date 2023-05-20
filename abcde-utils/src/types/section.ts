import {
  ManySectionChildrenType,
  SectionChildrenType,
} from "./sectionChildren";
import { SectionPositionType } from "./sectionPosition";
import { SizeType } from "./size";
import { ManyOf } from "./utils";

export type SectionType = {
  id: string;
  name: string;
  configId: string;
  sectionChildrenId: string;
  parentId: string | null;
  paramInfoId: string | null;
  size: SizeType;
  initialPosition: SectionPositionType;
  chainedFrom: string | null;
  zIndex: number;
};

export type ManySectionType = ManyOf<SectionType>;

export type SectionTypeSaveProjectToBackend = Omit<SectionType, "parentId">;
export type ManySectionTypeSaveProjectToBackend =
  ManyOf<SectionTypeSaveProjectToBackend>;

export type SectionInfoStateType = {
  x: ManySectionType;
  allChildren: ManySectionChildrenType;
  currChildren: ManySectionChildrenType;
  version: number;
};

export type SectionInfoActionType = {
  resetAndSetAll: (payload: {
    sections: ManySectionType;
    sectionChildren: ManySectionChildrenType;
  }) => void;

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

  initManyAllChildren: (payload: { sectionIds: string[] }) => void;

  setAllChildren: (payload: {
    sectionId: string;
    newStateFn: (currState: SectionChildrenType) => SectionChildrenType;
  }) => void;

  setCurrChildrenNames: (payload: {
    currChildren: SectionChildrenType;
    sectionType: any;
  }) => void;

  initManyCurrChildren: (payload: { sectionIds: string[] }) => void;

  setCurrChildren: (payload: {
    sectionId: string;
    currChildren: SectionChildrenType;
  }) => void;

  removeSectionInfos: (payload: string[]) => void;
};

export type SectionInfoZustandType = SectionInfoStateType &
  SectionInfoActionType;
