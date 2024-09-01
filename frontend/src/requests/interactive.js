import C from "constants/constants.json";
import { getProjectData } from "state/actions/project/saveProject";
import { post } from "./utils";

export async function dbUpdateInteractiveCode() {
  const project = getProjectData();
  return await post({
    body: { project, runOnImport: true },
    address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
  });
}
