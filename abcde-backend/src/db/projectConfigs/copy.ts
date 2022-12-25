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
  const newVals = {
    sectionConfigCol: createNewId(),
    childrenId: createNewId(),
  };
  if (newConfigName) {
    newVals['name'] = newConfigName;
  }
  if (doCreateNewId) {
    newVals['id'] = createNewId();
  }
  Object.assign(newProjectConfig, newVals);
  return newProjectConfig;
}
