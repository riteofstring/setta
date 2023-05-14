import { CodeInfoStateType, ManyCodeInfoType } from "./codeInfo";
import { CodeInfoMapStateType } from "./codeInfoMap";
import { ManyEVType } from "./ev";
import { ManyEVColType } from "./evCol";
import { ManyKwargColType } from "./kwargCol";
import { ManyOutputType } from "./output";
import { ManyOutputGroupType } from "./outputGroup";
import { ProjectType } from "./project";
import { ProjectConfigType } from "./projectConfig";
import { ManySectionTypeSaveProjectToBackend } from "./section";
import { ManySectionChildrenType } from "./sectionChildren";
import { ManySectionConfigType } from "./sectionConfig";
import { ManySectionDescriptionType } from "./sectionDescription";
import { ManyUITypeType } from "./uiType";
import { ManyUITypeColType } from "./uiTypeCol";

export type ProjectSaveType = {
  project: ProjectType;
  projectConfig: ProjectConfigType;
  ev: ManyEVType;
  evCols: ManyEVColType;
  uiTypes: ManyUITypeType;
  uiTypeCols: ManyUITypeColType;
  kwargInfo: ManyCodeInfoType;
  kwargCols: ManyKwargColType;
  sections: ManySectionTypeSaveProjectToBackend;
  sectionChildren: ManySectionChildrenType;
  sectionConfigs: ManySectionConfigType;
  sectionDescriptions: ManySectionDescriptionType;
  projectConfigCodeInfoMaps: CodeInfoMapStateType;
};

export type ProjectLoadType = Omit<ProjectSaveType, "kwargInfo"> & {
  codeInfo: CodeInfoStateType;
  userCodeInfoMaps: CodeInfoMapStateType;
  outputs: ManyOutputType;
  outputGroups: ManyOutputGroupType;
};
