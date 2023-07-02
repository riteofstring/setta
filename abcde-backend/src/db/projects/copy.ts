import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
import { copySections } from 'src/db/sections/copy';
import { copyProjectConfig } from '../projectConfigs/copy';
import { copyUITypeCols, copyUITypes } from '../uiTypes/copy';

export function copyProjectDetails(
  project: ProjectSaveType,
  newConfigName: string,
): ProjectSaveType {
  const {
    ev,
    evCols,
    uiTypes,
    uiTypeCols,
    sections,
    projectConfig,
    ...theRest
  } = project;

  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);
  const { newUITypes, uiTypeIdMap } = copyUITypes(uiTypes);
  const { newUITypeCols, uiTypeColIdMap } = copyUITypeCols(
    uiTypeCols,
    uiTypeIdMap,
  );
  const { newSections, sectionIdMap } = copySections({
    sections,
    evColIdMap,
    uiTypeIdMap,
    uiTypeColIdMap,
  });
  const newProjectConfig = copyProjectConfig({
    projectConfig,
    newConfigName,
    sectionIdMap,
  });

  return {
    ...theRest,
    ev: newEv,
    evCols: newEvCols,
    uiTypes: newUITypes,
    uiTypeCols: newUITypeCols,
    sections: newSections,
    projectConfig: newProjectConfig,
  };
}
