import { ProjectSaveType } from 'abcde-utils/src/types/projectSaveLoad';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
import { copySections } from 'src/db/sections/copy';

export function copyProjectDetails(project: ProjectSaveType): ProjectSaveType {
  const { ev, evCols, sections, ...theRest } = project;

  const { newEv, evIdMap } = copyEV(ev);
  const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);

  const newSections = copySections(sections, evColIdMap);

  return {
    ...theRest,
    ev: newEv,
    evCols: newEvCols,
    sections: newSections,
  };
}
