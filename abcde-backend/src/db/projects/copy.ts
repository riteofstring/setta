import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
import { copySections } from 'src/db/sections/copy';
import { copyKwargCols, copyKwargInfo } from '../kwargs/copy';
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
    kwargInfo,
    kwargCols,
    ev,
    evCols,
    uiTypes,
    uiTypeCols,
    sections,
    projectConfig,
    ...theRest
  } = project;

  const { newKwargInfo, kwargInfoIdMap } = copyKwargInfo(kwargInfo);
  const { newKwargCols, kwargColIdMap } = copyKwargCols(
    kwargCols,
    kwargInfoIdMap,
  );
  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols({
    evCols,
    evIdMap,
    kwargInfoIdMap,
  });
  const { newUITypes, uiTypeIdMap } = copyUITypes(uiTypes);
  const { newUITypeCols, uiTypeColIdMap } = copyUITypeCols({
    uiTypeCols,
    uiTypeIdMap,
    kwargInfoIdMap,
  });
  const { newSections, sectionIdMap } = copySections({
    sections,
    kwargInfoIdMap,
    kwargColIdMap,
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
    kwargInfo: newKwargInfo,
    kwargCols: newKwargCols,
    ev: newEv,
    evCols: newEvCols,
    uiTypes: newUITypes,
    uiTypeCols: newUITypeCols,
    sections: newSections,
    projectConfig: newProjectConfig,
  };
}
