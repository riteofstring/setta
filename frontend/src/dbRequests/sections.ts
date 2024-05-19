import { useKeywordRegex } from "models/info/keywordRegex";
import { useProjectConfig } from "models/info/projectConfig";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { findRefs } from "utils/CodeMirror/utils";
import { C } from "utils/constants";
import { post } from "./utils";

export async function dbGetSections() {
  return await post({
    body: {},
    address: C.ROUTE_SECTIONS,
  });
}

export async function dbLoadSection({ sectionId }) {
  return await post({
    body: { sectionId },
    address: C.ROUTE_SECTIONS,
  });
}

export async function dbParametersRequest({
  sectionId,
  fullText,
  beforeText,
  position,
}) {
  return await dbTextFieldCompletion({
    sectionId,
    paramInfoId: null,
    fullText,
    beforeText,
    position,
    address: "/parametersRequest",
  });
}

export async function dbTextFieldInitializeCode({ sectionId, paramInfoId }) {
  const project = getProjectDataToGenerateCode({});
  return await post({
    body: { project, sectionId, paramInfoId },
    address: "/textFieldInitializeCode",
  });
}

export async function dbTypeCheckRequest() {
  const project = getProjectDataToGenerateCode({});
  return await post({
    body: { project },
    address: "/typeCheckRequest",
  });
}

export async function dbTextFieldCompletion({
  sectionId,
  paramInfoId,
  fullText,
  beforeText,
  position,
  address = "/textFieldCompletion",
}) {
  const projectConfigId = useProjectConfig.getState().id;
  const { pattern: keywordRegex, fullNameToInfo } = useKeywordRegex.getState();
  const evRefs = findRefs(keywordRegex, fullNameToInfo, fullText);
  return await post({
    body: {
      projectConfigId,
      sectionId,
      paramInfoId,
      fullText,
      beforeText,
      position,
      evRefs,
    },
    address,
  });
}
