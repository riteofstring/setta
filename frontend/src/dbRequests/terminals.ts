import { post } from "./utils";

export async function dbGetFreeTerminal(projectConfigId) {
  return await post({
    body: {},
    address: `/terminal/getFreeTerminal/${projectConfigId}`,
  });
}

export async function dbDeleteTerminals(ids) {
  return await post({
    body: { ids },
    address: `/terminal/deleteTerminals`,
  });
}
