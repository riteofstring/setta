import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';

export function copyProjectConfig({
  projectConfig,
  newConfigName = null,
  doCreateNewId = true,
}: {
  projectConfig: ProjectConfigType;
  newConfigName?: string | null;
  doCreateNewId?: boolean;
}) {
  const newProjectConfig = _.cloneDeep(projectConfig);
  newProjectConfig.sectionConfigCol = createNewId();
  newProjectConfig.childrenId = createNewId();
  if (newConfigName) {
    newProjectConfig.name = newConfigName;
  }
  if (doCreateNewId) {
    newProjectConfig.id = createNewId();
  }
  return newProjectConfig;
}
