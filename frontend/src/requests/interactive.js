import C from "constants/constants.json";
import { getProjectDataForInteractive } from "state/actions/project/projectDataForInteractive";
import { post } from "./utils";

export async function dbUpdateInteractiveCode() {
  const project = getProjectDataForInteractive();
  console.log("dbUpdateInteractiveCode", project);
  return await post({
    body: { project },
    address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
  });
}
