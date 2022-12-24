import {
  ManySectionChildrenType,
  SectionChildrenType,
} from "./sectionChildren";
import { SectionConfigColType } from "./sectionConfigCol";
import { SectionPositionType } from "./sectionPosition";
import { ManyOf } from "./utils";

export type SectionCoreType = {
  id: string;
  name: string;
  sectionChildrenId: string;
  paramInfoId: string | null;
  initialPosition: SectionPositionType;
};

export type ManySectionCoreType = ManyOf<SectionCoreType>;

export type SectionType = SectionCoreType & {
  configId: string;
  parentId: string | null;
};

export type ManySectionType = ManyOf<SectionType>;

export type SectionInfoStateType = {
  x: ManySectionType;
  allChildren: ManySectionChildrenType;
  currChildren: ManySectionChildrenType;
};

export type SectionInfoActionType = {
  resetAndSetAll: (payload: {
    sections: ManySectionCoreType;
    sectionConfigCol: SectionConfigColType;
    sectionChildren: ManySectionChildrenType;
  }) => void;

  setSectionInfo: (
    newStateFn: (currState: ManySectionType) => ManySectionType
  ) => void;

  setSectionInfoAttr: <K extends keyof SectionType>(payloa: {
    sectionId?: string;
    sectionIds?: string[];
    attr: K;
    value: SectionType[K];
  }) => void;

  setSectionInfoAttrObjInput: (payload: {
    newValues: { [id: string]: Partial<SectionType> };
  }) => void;

  setAllChildren: (payload: {
    sectionId: string;
    newStateFn: (currState: SectionChildrenType) => SectionChildrenType;
  }) => void;

  setCurrChildrenNames: (payload: {
    currChildren: SectionChildrenType;
    sectionType: any;
  }) => void;

  setCurrChildren: (payload: {
    sectionId: string;
    currChildren: SectionChildrenType;
  }) => void;

  removeSectionInfos: (payload: string[]) => void;

  setAll: (payload: SectionInfoStateType) => void;

  reset: () => void;
};

export type SectionInfoZustandType = SectionInfoStateType &
  SectionInfoActionType;
