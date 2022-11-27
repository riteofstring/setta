import { NO_AUTH } from "utils/constants";
import { loadAllProjectsMetadata } from "__tests__utils/loadTestData";

export async function savePreset({ access_token, uiType }) {
  if (NO_AUTH) {
    return await loadAllProjectsMetadata();
  }

  //TODO
}
