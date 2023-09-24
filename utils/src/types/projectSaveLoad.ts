import { ManyCodeInfoType } from "./codeInfo";
import { CodeInfoTypeMapType } from "./codeInfoMap";
import { ManyEVColType } from "./evCol";
import { ManyOutputType } from "./output";
import { ManyOutputGroupType } from "./outputGroup";
import { ProjectType } from "./project";
import { ProjectConfigType } from "./projectConfig";
import { ManySectionTypeSaveProjectToBackend } from "./section";
import { ManyUITypeType } from "./uiType";
import { ManyUITypeColType } from "./uiTypeCol";

export type ProjectSaveType = {
  project: ProjectType;
  projectConfig: ProjectConfigType;
  evCols: ManyEVColType;
  uiTypes: ManyUITypeType;
  uiTypeCols: ManyUITypeColType;
  sections: ManySectionTypeSaveProjectToBackend;
  projectConfigCodeInfoMaps: CodeInfoTypeMapType;
  codeInfo: ManyCodeInfoType;
};

export type ProjectLoadType = ProjectSaveType & {
  userCodeInfoMaps: CodeInfoTypeMapType;
  outputs: ManyOutputType;
  outputGroups: ManyOutputGroupType;
};
