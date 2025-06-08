import { getProjectData } from "state/actions/project/saveProject";
import { useProjectState } from "state/definitions";
import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbSendProjectToInteractiveCode(projects) {
  return await post({
    body: { projects },
    address: RouteEnum.SEND_PROJECT_TO_INTERACTIVE_CODE,
  });
}

export async function dbKillSubprocesses() {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  return await post({
    body: { projectConfigId },
    address: RouteEnum.KILL_SUBPROCESSES,
  });
}

export async function dbFormateCode() {
  const project = getProjectData({});
  return await post({
    body: { project },
    address: RouteEnum.FORMAT_CODE,
  });
}
