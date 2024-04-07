import { useProjectConfig } from "models/info/projectConfig";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { SECTIONS } from "z_utils/routes";
import { post } from "./utils";

export async function dbGetSections() {
  return await post({
    body: {},
    address: SECTIONS,
  });
}

export async function dbLoadSection({ sectionId }) {
  return await post({
    body: { sectionId },
    address: SECTIONS,
  });
}

export async function dbParametersRequest({ sectionId, value }) {
  const projectConfigId = useProjectConfig.getState().id;
  return await post({
    body: { projectConfigId, sectionId, paramInfoId: null, value },
    address: "/parametersRequest",
  });
}

export async function dbTextFieldInitializeCode({ sectionId, paramInfoId }) {
  const project = getProjectDataToGenerateCode();
  return await post({
    body: { project, sectionId, paramInfoId },
    address: "/textFieldInitializeCode",
  });
}
