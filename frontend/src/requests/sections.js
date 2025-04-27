import C from "constants/constants.json";
import { addTemporaryNotification } from "state/actions/notifications";
import { getProjectDataToGenerateCode } from "state/actions/project/generateCode";
import { getSectionInfo } from "state/actions/sectionInfos";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useSectionInfos, useTypeErrors } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { asyncDebounce } from "utils/utils";
import { post } from "./utils";
import { sendMessage } from "./websocket";

export async function dbRequestTypeCheck(userRequested = false) {
  if (userRequested) {
    addTemporaryNotification("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const project = await getProjectDataToGenerateCode({});
  post({
    body: { project },
    address: C.ROUTE_TYPE_CHECK,
  });
}

export const debouncedTypeCheckRequest = asyncDebounce(dbRequestTypeCheck, 500);

export async function dbParametersRequest({ sectionId, fullText, position }) {
  return await dbTextFieldCompletion({
    sectionId,
    paramInfoId: null,
    fullText,
    position,
    messageType: C.WS_PARAMETERS_REQUEST,
  });
}

export async function dbTextFieldInitializeCode({ sectionId, paramInfoId }) {
  const project = await getProjectDataToGenerateCode({});
  await sendMessage({
    id: createNewId(),
    messageType: C.WS_TEXT_FIELD_INITIALIZE_CODE,
    content: { project, sectionId, paramInfoId },
  });
}

export async function dbCodeAreaInitializeCode(sectionId) {
  const project = await getProjectDataToGenerateCode({});
  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_CODE_AREA_INITIALIZE_CODE,
    content: { project, sectionId },
  });
}

export async function dbCodeAreaCompletion({
  sectionId,
  fullText,
  position,
  codeLanguage,
}) {
  const { id: projectConfigId, name: projectConfigName } =
    useSectionInfos.getState().projectConfig;
  const { name: sectionName } = getSectionInfo(sectionId);

  const autoCompleteProps = {
    id: createNewId(),
    messageType: C.WS_CODE_AREA_AUTOCOMPLETE,
    content: {
      projectConfigId,
      projectConfigName,
      codeLanguage,
      sectionId,
      sectionName,
      fullText,
      position,
    },
  };

  const res = await sendMessageAndWait(autoCompleteProps);

  if (res.data === C.CODE_AREA_GEN_CODE_NOT_INITIALIZED) {
    const res2 = await dbCodeAreaInitializeCode(sectionId);
    if (res2.data) {
      return await sendMessageAndWait(autoCompleteProps);
    } else {
      return [];
    }
  }
  return res;
}

export async function dbTextFieldCompletion({
  sectionId,
  paramInfoId,
  fullText,
  position,
  messageType = C.WS_TEXT_FIELD_AUTOCOMPLETE,
}) {
  const { id: projectConfigId, name: projectConfigName } =
    useSectionInfos.getState().projectConfig;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType,
    content: {
      projectConfigId,
      projectConfigName,
      sectionId,
      paramInfoId,
      fullText,
      position,
    },
  });
}

export async function getEVRefs({
  sectionId,
  paramInfoId,
  fullText,
  templateVars = null,
  onlyAfterGenCodeTemplateVar = false,
}) {
  let evRefs = [];
  let keywordPositions = [];
  let count = 0;
  keywordPositions = [];
  await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_FIND_EV_REFS,
    content: {
      sectionId,
      paramInfoId,
      fullText,
      templateVars,
      onlyAfterGenCodeTemplateVar,
    },
    condition: ({ data: { positions, numMessages } }) => {
      keywordPositions.push(...positions);
      count += 1;
      return count === numMessages;
    },
  });

  // CodeMirror's RangeSetBuilder needs the list to be sorted
  keywordPositions.sort((a, b) => a.startPos - b.startPos);

  return evRefs;
}

async function getTemplateVars(sectionId, fullText) {
  let templateVars = [];
  let keywordPositions = [];
  let count = 0;
  keywordPositions = [];
  await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_CODE_AREA_FIND_TEMPLATE_VARS,
    content: { sectionId, fullText },
    condition: ({ data: { positions, numMessages } }) => {
      if (positions !== null) {
        keywordPositions.push(...positions);
      }
      count += 1;
      return count === numMessages;
    },
  });

  // CodeMirror's RangeSetBuilder needs the list to be sorted
  keywordPositions.sort((a, b) => a.startPos - b.startPos);

  return templateVars;
}

export async function getEVRefsAndTemplateVarsForCodeArea(sectionId, value) {
  const templateVars = await getTemplateVars(sectionId, value);

  const evRefs = await getEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    templateVars,
    onlyAfterGenCodeTemplateVar: true,
  });

  return { templateVars, evRefs };
}
