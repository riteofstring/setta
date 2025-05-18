import C from "constants/constants.json";
import { getProjectData } from "state/actions/project/saveProject";
import { useProjectState } from "state/definitions";
import { post } from "./utils";

export async function dbSendProjectToInteractiveCode(projects) {
  return await post({
    body: { projects },
    address: C.ROUTE_SEND_PROJECT_TO_INTERACTIVE_CODE,
  });
}

export async function dbKillSubprocesses() {
  const projectConfigId = useProjectState.getState().projectConfigId;
  return await post({
    body: { projectConfigId },
    address: C.ROUTE_KILL_SUBPROCESSES,
  });
}

export async function dbFormateCode() {
  const project = getProjectData({});
  return await post({
    body: { project },
    address: C.ROUTE_FORMAT_CODE,
  });
}
