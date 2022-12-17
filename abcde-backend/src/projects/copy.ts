import { copyEV, copyEVCols } from 'src/enteredValues/copy';
import { copySectionConfigCol, copySectionConfigs } from 'src/sections/copy';

export function copyProjectDetails(project) {
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
