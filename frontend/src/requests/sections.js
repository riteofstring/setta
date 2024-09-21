import {
  findCandidateKeywords,
  findRefs,
} from "components/Utils/CodeMirror/utils";
import C from "constants/constants.json";
import _ from "lodash";
import { getProjectDataToGenerateCode } from "state/actions/project/generateCode";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useKeywordRegex, useProjectConfig } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { post } from "./utils";
import { sendMessage } from "./websocket";

export function dbRequestTypeCheck() {
  const project = getProjectDataToGenerateCode({});
  sendMessage({
    content: project,
    id: createNewId(),
    messageType: "typeCheck",
  });
}

export const debouncedTypeCheckRequest = _.debounce(dbRequestTypeCheck, 500);

export async function dbSectionToDict(sectionId, pinnedIds, unpinnedIds) {
  const project = getProjectDataToGenerateCode({});
  pinnedIds.requiredParamIds = Array.from(pinnedIds.requiredParamIds);
  unpinnedIds.requiredParamIds = Array.from(unpinnedIds.requiredParamIds);
  return await post({
    body: { project, sectionId, pinnedIds, unpinnedIds },
    address: C.ROUTE_SECTION_TO_DICT,
  });
}

export async function dbGetSections() {
  return await post({
    body: {},
    address: C.ROUTE_SECTIONS,
  });
}

export async function dbParametersRequest({
  sectionId,
  fullText,
  beforeText,
  position,
  evRefs,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  return await sendMessageAndWait({
    id: `${C.ROUTE_PARAMETERS_REQUEST}-${sectionId}-${null}`,
    messageType: "parametersRequest",
    content: {
      projectConfigId,
      sectionId,
      paramInfoId: null,
      fullText,
      beforeText,
      position,
      evRefs,
    },
  });
}

export async function dbTextFieldInitializeCode({ sectionId, paramInfoId }) {
  const project = getProjectDataToGenerateCode({});
  const id = `${C.ROUTE_TEXT_FIELD_INITIALIZE_CODE}-${sectionId}-${paramInfoId}`;
  await sendMessage({
    id,
    messageType: "textFieldInitializeCode",
    content: { project, sectionId, paramInfoId },
  });
}

export async function dbCodeAreaInitializeCode({ sectionId }) {
  const project = getProjectDataToGenerateCode({});
  const id = `${C.ROUTE_CODE_AREA_INITIALIZE_CODE}-${sectionId}`;
  return await sendMessageAndWait({
    id,
    messageType: "codeAreaInitializeCode",
    content: { project, sectionId },
  });
}

export async function dbCodeAreaCompletion({
  sectionId,
  fullText,
  beforeText,
  position,
  setKeywordPositions,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  const { evRefs, keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId: null,
    fullText,
    regexPatternKey: "codeAreaPattern",
  });

  setKeywordPositions(keywordPositions);

  const autoCompleteProps = {
    id: `${C.ROUTE_CODE_AREA_COMPLETION}-${sectionId}`,
    messageType: "codeAreaAutocomplete",
    content: {
      projectConfigId,
      sectionId,
      fullText,
      beforeText,
      position,
      evRefs,
    },
  };

  const res = await sendMessageAndWait(autoCompleteProps);

  if (res === C.CODE_AREA_GEN_CODE_NOT_INITIALIZED) {
    const initialized = await dbCodeAreaInitializeCode({ sectionId });
    if (initialized) {
      return await sendMessageAndWait(autoCompleteProps);
    } else {
      console.log("dbCodeAreaCompletion initialization failed!");
      return [];
    }
  }
  return res;
}

export async function dbTypeCheckRequest() {
  const project = getProjectDataToGenerateCode({});
  return await post({
    body: { project },
    address: C.ROUTE_TYPE_CHECK_REQUEST,
  });
}

export async function dbTextFieldCompletion({
  sectionId,
  paramInfoId,
  fullText,
  beforeText,
  position,
  setKeywordPositions,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  const { evRefs, keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId,
    fullText,
  });

  setKeywordPositions(keywordPositions);

  return await sendMessageAndWait({
    id: `${C.ROUTE_TEXT_FIELD_COMPLETION}-${sectionId}-${paramInfoId}`,
    messageType: "textFieldCompletion",
    content: {
      projectConfigId,
      sectionId,
      paramInfoId,
      fullText,
      beforeText,
      position,
      evRefs,
    },
  });
}

export async function getKeywordPositionsAndEVRefs({
  sectionId,
  paramInfoId,
  fullText,
  messageIdSuffix = "",
  regexPatternKey = "pattern",
}) {
  const { fullNameToInfo } = useKeywordRegex.getState();
  let evRefs = [];
  let keywordPositions = [];
  const candidateKeywords = findCandidateKeywords({
    sectionId,
    paramInfoId,
    value: fullText,
    fullNameToInfo,
    regexPatternKey,
  });
  console.log("candidateKeywords", candidateKeywords);
  if (candidateKeywords.length > 0) {
    let count = 0;
    keywordPositions = [];
    await sendMessageAndWait({
      id: `${sectionId}-${paramInfoId}-find-references${messageIdSuffix}`,
      messageType: "textFieldFindReferences",
      content: { sectionId, paramInfoId, candidateKeywords, fullText },
      condition: (x) => {
        keywordPositions.push(...x);
        count += 1;
        return count === candidateKeywords.length;
      },
    });

    // CodeMirror's RangeSetBuilder needs the list to be sorted
    keywordPositions.sort((a, b) => a.startPos - b.startPos);

    evRefs = findRefs({
      keywordPositions,
      fullNameToInfo,
      fullText,
    });
  }

  return { evRefs, keywordPositions };
}
