import {
  ManySectionChildrenType,
  SectionChildrenType,
} from "./sectionChildren";
import { SectionConfigColType } from "./sectionConfigCol";
import { SectionPositionType } from "./sectionPosition";
import { ManyOf } from "./utils";

export type SectionCoreInfoType = {
  id: string;
  name: string;
  sectionChildrenId: string;
  paramInfoId: string | null;
  initialPosition: SectionPositionType;
};

export type ManySectionCoreInfoType = ManyOf<SectionCoreInfoType>;

export type SectionInfoType = SectionCoreInfoType & {
  configId: string;
  parentId: string | null;
};

export type ManySectionInfoType = ManyOf<SectionInfoType>;

export type SectionInfoStateType = {
  x: ManySectionInfoType;
  allChildren: ManySectionChildrenType;
  currChildren: ManySectionChildrenType;
};

export type SectionInfoStateActionType = {
  resetAndSetAll: (payload: {
    sections: ManySectionCoreInfoType;
    sectionConfigCol: SectionConfigColType;
    sectionChildren: ManySectionChildrenType;
  }) => void;

  setSectionInfo: (
    newStateFn: (currState: ManySectionInfoType) => ManySectionInfoType
  ) => void;

  setSectionInfoAttr: <K extends keyof SectionInfoType>(payloa: {
    sectionId?: string;
    sectionIds?: string[];
    attr: K;
    value: SectionInfoType[K];
  }) => void;

  setSectionInfoAttrObjInput: (payload: {
    newValues: { [id: string]: Partial<SectionInfoType> };
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
  SectionInfoStateActionType;
