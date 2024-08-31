import {
  findCandidateKeywords,
  findRefs,
} from "components/Utils/CodeMirror/utils";
import C from "constants/constants.json";
import { getProjectDataToGenerateCode } from "state/actions/project/generateCode";
import { sendMessageInRoom } from "state/actions/websocket/websocketRooms";
import {
  useKeywordRegex,
  useProjectConfig,
  useTempKeywordPositions,
} from "state/definitions";
import { post } from "./utils";
import { sendMessage } from "./websocket";

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
  evRefs,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  return await sendMessageInRoom({
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
  sendMessage({
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
}) {
  const projectConfigId = useProjectConfig.getState().id;
  const { evRefs } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId: null,
    fullText,
  });

  return await sendMessageInRoom({
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
  });
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
}) {
  const projectConfigId = useProjectConfig.getState().id;
  const { evRefs } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId,
    fullText,
  });

  return await sendMessageInRoom({
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
}) {
  const { fullNameToInfo } = useKeywordRegex.getState();
  let evRefs = [];
  let keywordPositions = [];
  const candidateKeywords = findCandidateKeywords({
    sectionId,
    paramInfoId,
    value: fullText,
    fullNameToInfo,
  });
  console.log("candidateKeywords", candidateKeywords);
  if (candidateKeywords.length > 0) {
    let count = 0;
    keywordPositions = [];
    await sendMessageInRoom({
      id: `${sectionId}-${paramInfoId}-find-references${messageIdSuffix}`,
      messageType: "textFieldFindReferences",
      content: { sectionId, paramInfoId, candidateKeywords, fullText },
      condition: (x) => {
        keywordPositions.push(...x);
        count += 1;
        return count === candidateKeywords.length;
      },
    });

    evRefs = findRefs({
      keywordPositions,
      fullNameToInfo,
      fullText,
    });
  }

  useTempKeywordPositions.setState({
    [`${sectionId}-${paramInfoId}`]: keywordPositions,
  });

  return { evRefs, keywordPositions };
}
