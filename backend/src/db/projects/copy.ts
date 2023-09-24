import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEVCols } from 'src/db/enteredValues/copy';
import { copySections } from 'src/db/sections/copy';
import { copyCodeInfo } from '../codeInfo/copy';
import { copyProjectConfig } from '../projectConfigs/copy';
import { copyUITypeCols, copyUITypes } from '../uiTypes/copy';

export function copyProjectDetails({
  project,
  newConfigName = null,
  doCreateNewId = false,
}: {
  project: ProjectSaveType;
  newConfigName?: string | null;
  doCreateNewId?: boolean;
}): ProjectSaveType {
  const {
    codeInfo,
    evCols,
    uiTypes,
    uiTypeCols,
    sections,
    projectConfig,
    ...theRest
  } = project;

  const { newCodeInfo, codeInfoIdMap } = copyCodeInfo(codeInfo);
  const { newEvCols, evColIdMap } = copyEVCols({
    evCols,
    codeInfoIdMap,
  });
  const { newUITypes, uiTypeIdMap } = copyUITypes(uiTypes);
  const { newUITypeCols, uiTypeColIdMap } = copyUITypeCols({
    uiTypeCols,
    uiTypeIdMap,
    codeInfoIdMap,
  });
  const { newSections, sectionIdMap } = copySections({
    sections,
    codeInfoIdMap,
    evColIdMap,
    uiTypeIdMap,
    uiTypeColIdMap,
  });
  const newProjectConfig = copyProjectConfig({
    projectConfig,
    newConfigName,
    doCreateNewId,
    sectionIdMap,
  });

  return {
    ...theRest,
    codeInfo: newCodeInfo,
    evCols: newEvCols,
    uiTypes: newUITypes,
    uiTypeCols: newUITypeCols,
    sections: newSections,
    projectConfig: newProjectConfig,
  };
}
