import {
  saveAsNewProjectConfig as saveAsNewProjectConfigRequest,
  saveProject as saveProjectRequest,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useProjectState } from "state/definitions";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { flushQueuedArtifacts } from "../artifacts";
import { addTemporaryNotification } from "../notifications";
export async function saveProject() {
  addTemporaryNotification("Saving...", NotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const projectConfigId = useProjectState.getState().projectConfig.id;
  void callOpenAPI(
    saveProjectRequest({
      body: {
        projectConfigId,
      },
    } as Parameters<typeof saveProjectRequest>[0]),
  );
}
export async function saveAsNewProjectConfig(
  newConfigName: string,
  withRefs: boolean,
) {
  addTemporaryNotification("Saving...", NotificationTypeEnum.save);
  await flushQueuedArtifacts();
  const projectConfigId = useProjectState.getState().projectConfig.id;
  void callOpenAPI(
    saveAsNewProjectConfigRequest({
      body: {
        projectConfigId,
        newConfigName,
        withRefs,
      },
    } as Parameters<typeof saveAsNewProjectConfigRequest>[0]),
  );
}
