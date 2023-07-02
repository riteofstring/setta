import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';

export function copyProjectConfig({
  projectConfig,
  newConfigName = null,
  doCreateNewId = true,
  sectionIdMap = null,
}: {
  projectConfig: ProjectConfigType;
  newConfigName?: string | null;
  doCreateNewId?: boolean;
  sectionIdMap: Record<string, string> | null;
}) {
  const newProjectConfig = _.cloneDeep(projectConfig);
  if (newConfigName) {
    newProjectConfig.name = newConfigName;
  }
  if (doCreateNewId) {
    newProjectConfig.id = createNewId();
  }
  if (sectionIdMap) {
    for (const sectionId of Object.keys(newProjectConfig.children)) {
      if (sectionId in sectionIdMap) {
        newProjectConfig.children[sectionIdMap[sectionId]] =
          newProjectConfig.children[sectionId];
        delete newProjectConfig.children[sectionId];
      }
    }
  }
  return newProjectConfig;
}
