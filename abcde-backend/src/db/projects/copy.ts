import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
import { copySectionConfigs, copySections } from 'src/db/sections/copy';

export function copyProjectDetails(project: ProjectSaveType): ProjectSaveType {
  const { ev, evCols, sections, sectionConfigs, ...theRest } = project;

  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);
  const { newSectionConfigs, sectionConfigIdMap } = copySectionConfigs(
    sectionConfigs,
    evColIdMap,
  );

  const newSections = copySections(sections, sectionConfigIdMap);

  return {
    ...theRest,
    ev: newEv,
    evCols: newEvCols,
    sections: newSections,
    sectionConfigs: newSectionConfigs,
  };
}
