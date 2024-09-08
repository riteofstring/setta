import C from "constants/constants.json";
import { getProjectDataForInteractive } from "state/actions/project/projectDataForInteractive";
import { getProjectData } from "state/actions/project/saveProject";
import { post } from "./utils";

export async function dbUpdateInteractiveCode() {
  const project = getProjectDataForInteractive();
  console.log("dbUpdateInteractiveCode", project);
  return await post({
    body: { project },
    address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
  });
}

export async function dbFormateCode() {
  const project = getProjectData({});
  return await post({
    body: { project },
    address: C.ROUTE_FORMAT_CODE,
  });
}
