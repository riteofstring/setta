import { ManyCodeInfoType } from "./codeInfo";
import { ManyEVType } from "./ev";
import { ManyEVColType } from "./evCol";
import { ManyKwargColType } from "./kwargCol";
import { ProjectType } from "./project";
import { ProjectConfigType } from "./projectConfig";
import { ManySectionCoreType } from "./section";
import { ManySectionChildrenType } from "./sectionChildren";
import { ManySectionConfigType } from "./sectionConfig";
import { SectionConfigColType } from "./sectionConfigCol";
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
  sections: ManySectionCoreType;
  sectionChildren: ManySectionChildrenType;
  sectionConfigs: ManySectionConfigType;
  sectionConfigCol: SectionConfigColType;
};
