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

export async function dbTypeCheckRequest() {
  const project = getProjectDataToGenerateCode();
  return await post({
    body: { project },
    address: "/typeCheckRequest",
  });
}

export async function dbTextFieldCompletion({
  sectionId,
  paramInfoId,
  beforeText,
  fullText,
  position,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  return await post({
    body: {
      projectConfigId,
      sectionId,
      paramInfoId,
      beforeText,
      fullText,
      position,
    },
    address: "/textFieldCompletion",
  });
}

// export const dbTextFieldCompletion = _.debounce(
//   ({ sectionId, paramInfoId, value }) => {
//     return _dbTextFieldCompletion({ sectionId, paramInfoId, value });
//   },
//   100,
// );
