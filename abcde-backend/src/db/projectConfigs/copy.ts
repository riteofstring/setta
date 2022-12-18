import { createNewId } from 'abcde-utils/src/utils';
import * as _ from 'lodash';

export function copyProjectConfig({
  projectConfig,
  newConfigName = null,
  doCreateNewId = true,
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
