import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
import { copySectionConfigCol, copySectionConfigs } from 'src/db/sections/copy';

export function copyProjectDetails(project: ProjectSaveType): ProjectSaveType {
  const { ev, evCols, sectionConfigs, sectionConfigCol, ...theRest } = project;

  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);
  const { newSectionConfigs, sectionConfigIdMap } = copySectionConfigs(
    sectionConfigs,
    evColIdMap,
  );
  const newSectionConfigCol = copySectionConfigCol(
    sectionConfigCol,
    sectionConfigIdMap,
  );

  return {
    ...theRest,
    ev: newEv,
    evCols: newEvCols,
    sectionConfigs: newSectionConfigs,
    sectionConfigCol: newSectionConfigCol,
  };
}
