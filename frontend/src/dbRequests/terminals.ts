import { post } from "./utils";

export async function dbGetFreeTerminal(projectConfigId) {
  return await post({
    body: {},
    address: `/terminal/getFreeTerminal/${projectConfigId}`,
  });
}
