import { useProjectState } from "state/definitions";
import {
  route_save_as_new_project_config,
  route_save_project,
} from "utils/generatedEndpoints";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { flushQueuedArtifacts } from "../artifacts";
import { addTemporaryNotification } from "../notifications";

export async function saveProject() {
  addTemporaryNotification("Saving...", NotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const projectConfigId = useProjectState.getState().projectConfig.id;
  route_save_project({ projectConfigId });
}

export async function saveAsNewProjectConfig(
  newConfigName: string,
  withRefs: boolean,
) {
  addTemporaryNotification("Saving...", NotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const projectConfigId = useProjectState.getState().projectConfig.id;
  route_save_as_new_project_config({
    projectConfigId,
    newConfigName,
    withRefs,
  });
}
