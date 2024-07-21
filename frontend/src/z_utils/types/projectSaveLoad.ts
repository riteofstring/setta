import { ProjectType } from "./project";
import { ProjectConfigType } from "./projectConfig";
import { ManySectionTypeSaveProjectToBackend } from "./section";
import { ManyUITypeType } from "./uiType";
import { ManyUITypeColType } from "./uiTypeCol";

export type ProjectSaveType = {
  project: ProjectType;
  projectConfig: ProjectConfigType;
  evCols;
  uiTypes: ManyUITypeType;
  uiTypeCols: ManyUITypeColType;
  sections: ManySectionTypeSaveProjectToBackend;
};

export type ProjectLoadType = ProjectSaveType & {
  outputs;
  outputGroups;
};
