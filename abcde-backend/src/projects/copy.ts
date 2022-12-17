import { copyEV, copyEVCols } from 'src/enteredValues/save';
import { copySectionConfigCol, copySectionConfigs } from 'src/sections/save';

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
