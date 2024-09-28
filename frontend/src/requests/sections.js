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
  pinnedIds.requiredParamIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
  unpinnedIds.requiredParamIds = Object.keys(
    unpinnedIds.requiredParamIdsToPaths,
  );
  delete pinnedIds.requiredParamIdsToPaths;
  delete unpinnedIds.requiredParamIdsToPaths;
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
  // const { evRefs, keywordPositions } = await getKeywordPositionsAndEVRefs({
  //   sectionId,
  //   paramInfoId,
  //   fullText,
  // });

  // setKeywordPositions(keywordPositions);
  const evRefs = [];

  // return await sendMessageAndWait({
  //   id: `${C.ROUTE_TEXT_FIELD_COMPLETION}-${sectionId}-${paramInfoId}`,
  //   messageType: "textFieldCompletion",
  //   content: {
  //     projectConfigId,
  //     sectionId,
  //     paramInfoId,
  //     fullText,
  //     beforeText,
  //     position,
  //     evRefs,
  //   },
  // });

  return BIG_LIST;
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

const BIG_LIST = [
  {
    label: "CRUMBS!",
    type: "variable",
  },
  {
    label: "explicit_aquamarine",
    type: "variable",
  },
  {
    label: "__primitive_gold",
    type: "variable",
  },
  {
    label: "primitive_gold",
    type: "variable",
  },
  {
    label: "__subjective_lavender",
    type: "variable",
  },
  {
    label: "subjective_lavender",
    type: "variable",
  },
  {
    label: "__chubby_aqua",
    type: "variable",
  },
  {
    label: "chubby_aqua",
    type: "variable",
  },
  {
    label: "__psychological_violet",
    type: "variable",
  },
  {
    label: "psychological_violet",
    type: "variable",
  },
  {
    label: "__shocked_indigo",
    type: "variable",
  },
  {
    label: "shocked_indigo",
    type: "variable",
  },
  {
    label: "__guilty_amber",
    type: "variable",
  },
  {
    label: "guilty_amber",
    type: "variable",
  },
  {
    label: "__immediate_purple",
    type: "variable",
  },
  {
    label: "immediate_purple",
    type: "variable",
  },
  {
    label: "__important_rose",
    type: "variable",
  },
  {
    label: "important_rose",
    type: "variable",
  },
  {
    label: "__rival_gray",
    type: "variable",
  },
  {
    label: "rival_gray",
    type: "variable",
  },
  {
    label: "__influential_lavender",
    type: "variable",
  },
  {
    label: "influential_lavender",
    type: "variable",
  },
  {
    label: "__ratty_cyan",
    type: "variable",
  },
  {
    label: "ratty_cyan",
    type: "variable",
  },
  {
    label: "__soviet_lavender",
    type: "variable",
  },
  {
    label: "soviet_lavender",
    type: "variable",
  },
  {
    label: "__tragic_amaranth",
    type: "variable",
  },
  {
    label: "tragic_amaranth",
    type: "variable",
  },
  {
    label: "__loyal_aqua",
    type: "variable",
  },
  {
    label: "loyal_aqua",
    type: "variable",
  },
  {
    label: "__loyal_purple",
    type: "variable",
  },
  {
    label: "loyal_purple",
    type: "variable",
  },
  {
    label: "__static_black",
    type: "variable",
  },
  {
    label: "static_black",
    type: "variable",
  },
  {
    label: "__sole_rose",
    type: "variable",
  },
  {
    label: "sole_rose",
    type: "variable",
  },
  {
    label: "__zeroth_chocolate",
    type: "variable",
  },
  {
    label: "zeroth_chocolate",
    type: "variable",
  },
  {
    label: "__unexpected_rose",
    type: "variable",
  },
  {
    label: "unexpected_rose",
    type: "variable",
  },
  {
    label: "__technical_gray",
    type: "variable",
  },
  {
    label: "technical_gray",
    type: "variable",
  },
  {
    label: "__general_silver",
    type: "variable",
  },
  {
    label: "general_silver",
    type: "variable",
  },
  {
    label: "__novel_magenta",
    type: "variable",
  },
  {
    label: "novel_magenta",
    type: "variable",
  },
  {
    label: "__lovely_chocolate",
    type: "variable",
  },
  {
    label: "lovely_chocolate",
    type: "variable",
  },
  {
    label: "__costly_purple",
    type: "variable",
  },
  {
    label: "costly_purple",
    type: "variable",
  },
  {
    label: "__domestic_silver",
    type: "variable",
  },
  {
    label: "domestic_silver",
    type: "variable",
  },
  {
    label: "__cute_emerald",
    type: "variable",
  },
  {
    label: "cute_emerald",
    type: "variable",
  },
  {
    label: "__strategic_turquoise",
    type: "variable",
  },
  {
    label: "strategic_turquoise",
    type: "variable",
  },
  {
    label: "__big_tan",
    type: "variable",
  },
  {
    label: "big_tan",
    type: "variable",
  },
  {
    label: "__fatal_tan[0]",
    type: "variable",
  },
  {
    label: "fatal_tan[0]",
    type: "variable",
  },
  {
    label: "__fatal_tan[1]",
    type: "variable",
  },
  {
    label: "fatal_tan[1]",
    type: "variable",
  },
  {
    label: "__fatal_tan[2]",
    type: "variable",
  },
  {
    label: "fatal_tan[2]",
    type: "variable",
  },
  {
    label: "__fatal_tan[3]",
    type: "variable",
  },
  {
    label: "fatal_tan[3]",
    type: "variable",
  },
  {
    label: "__fatal_tan[4]",
    type: "variable",
  },
  {
    label: "fatal_tan[4]",
    type: "variable",
  },
  {
    label: "__fatal_tan[5]",
    type: "variable",
  },
  {
    label: "fatal_tan[5]",
    type: "variable",
  },
  {
    label: "__fatal_tan[6]",
    type: "variable",
  },
  {
    label: "fatal_tan[6]",
    type: "variable",
  },
  {
    label: "__fatal_tan[7]",
    type: "variable",
  },
  {
    label: "fatal_tan[7]",
    type: "variable",
  },
  {
    label: "__fatal_tan[8]",
    type: "variable",
  },
  {
    label: "fatal_tan[8]",
    type: "variable",
  },
  {
    label: "__fatal_tan[9]",
    type: "variable",
  },
  {
    label: "fatal_tan[9]",
    type: "variable",
  },
  {
    label: "__fatal_tan[10]",
    type: "variable",
  },
  {
    label: "fatal_tan[10]",
    type: "variable",
  },
  {
    label: "__fatal_tan[11]",
    type: "variable",
  },
  {
    label: "fatal_tan[11]",
    type: "variable",
  },
  {
    label: "__fatal_tan[12]",
    type: "variable",
  },
  {
    label: "fatal_tan[12]",
    type: "variable",
  },
  {
    label: "__fatal_tan[13]",
    type: "variable",
  },
  {
    label: "fatal_tan[13]",
    type: "variable",
  },
  {
    label: "__fatal_tan[14]",
    type: "variable",
  },
  {
    label: "fatal_tan[14]",
    type: "variable",
  },
  {
    label: "__fatal_tan[15]",
    type: "variable",
  },
  {
    label: "fatal_tan[15]",
    type: "variable",
  },
  {
    label: "__fatal_tan[16]",
    type: "variable",
  },
  {
    label: "fatal_tan[16]",
    type: "variable",
  },
  {
    label: "__fatal_tan[17]",
    type: "variable",
  },
  {
    label: "fatal_tan[17]",
    type: "variable",
  },
  {
    label: "__fatal_tan[18]",
    type: "variable",
  },
  {
    label: "fatal_tan[18]",
    type: "variable",
  },
  {
    label: "__fatal_tan[19]",
    type: "variable",
  },
  {
    label: "fatal_tan[19]",
    type: "variable",
  },
  {
    label: "__fatal_tan[20]",
    type: "variable",
  },
  {
    label: "fatal_tan[20]",
    type: "variable",
  },
  {
    label: "__fatal_tan[21]",
    type: "variable",
  },
  {
    label: "fatal_tan[21]",
    type: "variable",
  },
  {
    label: "__fatal_tan[22]",
    type: "variable",
  },
  {
    label: "fatal_tan[22]",
    type: "variable",
  },
  {
    label: "__fatal_tan[23]",
    type: "variable",
  },
  {
    label: "fatal_tan[23]",
    type: "variable",
  },
  {
    label: "__fatal_tan[24]",
    type: "variable",
  },
  {
    label: "fatal_tan[24]",
    type: "variable",
  },
  {
    label: "__fatal_tan[25]",
    type: "variable",
  },
  {
    label: "fatal_tan[25]",
    type: "variable",
  },
  {
    label: "__fatal_tan[26]",
    type: "variable",
  },
  {
    label: "fatal_tan[26]",
    type: "variable",
  },
  {
    label: "__fatal_tan[27]",
    type: "variable",
  },
  {
    label: "fatal_tan[27]",
    type: "variable",
  },
  {
    label: "__fatal_tan[28]",
    type: "variable",
  },
  {
    label: "fatal_tan[28]",
    type: "variable",
  },
  {
    label: "__fatal_tan[29]",
    type: "variable",
  },
  {
    label: "fatal_tan[29]",
    type: "variable",
  },
  {
    label: "__fatal_tan[30]",
    type: "variable",
  },
  {
    label: "fatal_tan[30]",
    type: "variable",
  },
  {
    label: "__fatal_tan[31]",
    type: "variable",
  },
  {
    label: "fatal_tan[31]",
    type: "variable",
  },
  {
    label: "__fatal_tan[32]",
    type: "variable",
  },
  {
    label: "fatal_tan[32]",
    type: "variable",
  },
  {
    label: "__fatal_tan[33]",
    type: "variable",
  },
  {
    label: "fatal_tan[33]",
    type: "variable",
  },
  {
    label: "__fatal_tan[34]",
    type: "variable",
  },
  {
    label: "fatal_tan[34]",
    type: "variable",
  },
  {
    label: "__fatal_tan[35]",
    type: "variable",
  },
  {
    label: "fatal_tan[35]",
    type: "variable",
  },
  {
    label: "__fatal_tan[36]",
    type: "variable",
  },
  {
    label: "fatal_tan[36]",
    type: "variable",
  },
  {
    label: "__fatal_tan[37]",
    type: "variable",
  },
  {
    label: "fatal_tan[37]",
    type: "variable",
  },
  {
    label: "__fatal_tan[38]",
    type: "variable",
  },
  {
    label: "fatal_tan[38]",
    type: "variable",
  },
  {
    label: "__fatal_tan[39]",
    type: "variable",
  },
  {
    label: "fatal_tan[39]",
    type: "variable",
  },
  {
    label: "__fatal_tan[40]",
    type: "variable",
  },
  {
    label: "fatal_tan[40]",
    type: "variable",
  },
  {
    label: "__fatal_tan[41]",
    type: "variable",
  },
  {
    label: "fatal_tan[41]",
    type: "variable",
  },
  {
    label: "__fatal_tan[42]",
    type: "variable",
  },
  {
    label: "fatal_tan[42]",
    type: "variable",
  },
  {
    label: "__fatal_tan[43]",
    type: "variable",
  },
  {
    label: "fatal_tan[43]",
    type: "variable",
  },
  {
    label: "__fatal_tan[44]",
    type: "variable",
  },
  {
    label: "fatal_tan[44]",
    type: "variable",
  },
  {
    label: "__fatal_tan[45]",
    type: "variable",
  },
  {
    label: "fatal_tan[45]",
    type: "variable",
  },
  {
    label: "__fatal_tan[46]",
    type: "variable",
  },
  {
    label: "fatal_tan[46]",
    type: "variable",
  },
  {
    label: "__fatal_tan[47]",
    type: "variable",
  },
  {
    label: "fatal_tan[47]",
    type: "variable",
  },
  {
    label: "__fatal_tan[48]",
    type: "variable",
  },
  {
    label: "fatal_tan[48]",
    type: "variable",
  },
  {
    label: "__fatal_tan[49]",
    type: "variable",
  },
  {
    label: "fatal_tan[49]",
    type: "variable",
  },
  {
    label: "__fatal_tan[50]",
    type: "variable",
  },
  {
    label: "fatal_tan[50]",
    type: "variable",
  },
  {
    label: "__fatal_tan[51]",
    type: "variable",
  },
  {
    label: "fatal_tan[51]",
    type: "variable",
  },
  {
    label: "__fatal_tan[52]",
    type: "variable",
  },
  {
    label: "fatal_tan[52]",
    type: "variable",
  },
  {
    label: "__fatal_tan[53]",
    type: "variable",
  },
  {
    label: "fatal_tan[53]",
    type: "variable",
  },
  {
    label: "__fatal_tan[54]",
    type: "variable",
  },
  {
    label: "fatal_tan[54]",
    type: "variable",
  },
  {
    label: "__fatal_tan[55]",
    type: "variable",
  },
  {
    label: "fatal_tan[55]",
    type: "variable",
  },
  {
    label: "__fatal_tan[56]",
    type: "variable",
  },
  {
    label: "fatal_tan[56]",
    type: "variable",
  },
  {
    label: "__fatal_tan[57]",
    type: "variable",
  },
  {
    label: "fatal_tan[57]",
    type: "variable",
  },
  {
    label: "__fatal_tan[58]",
    type: "variable",
  },
  {
    label: "fatal_tan[58]",
    type: "variable",
  },
  {
    label: "__fatal_tan[59]",
    type: "variable",
  },
  {
    label: "fatal_tan[59]",
    type: "variable",
  },
  {
    label: "__fatal_tan[60]",
    type: "variable",
  },
  {
    label: "fatal_tan[60]",
    type: "variable",
  },
  {
    label: "__fatal_tan[61]",
    type: "variable",
  },
  {
    label: "fatal_tan[61]",
    type: "variable",
  },
  {
    label: "__fatal_tan[62]",
    type: "variable",
  },
  {
    label: "fatal_tan[62]",
    type: "variable",
  },
  {
    label: "__fatal_tan[63]",
    type: "variable",
  },
  {
    label: "fatal_tan[63]",
    type: "variable",
  },
  {
    label: "__fatal_tan[64]",
    type: "variable",
  },
  {
    label: "fatal_tan[64]",
    type: "variable",
  },
  {
    label: "__fatal_tan[65]",
    type: "variable",
  },
  {
    label: "fatal_tan[65]",
    type: "variable",
  },
  {
    label: "__fatal_tan[66]",
    type: "variable",
  },
  {
    label: "fatal_tan[66]",
    type: "variable",
  },
  {
    label: "__fatal_tan[67]",
    type: "variable",
  },
  {
    label: "fatal_tan[67]",
    type: "variable",
  },
  {
    label: "__fatal_tan[68]",
    type: "variable",
  },
  {
    label: "fatal_tan[68]",
    type: "variable",
  },
  {
    label: "__fatal_tan[69]",
    type: "variable",
  },
  {
    label: "fatal_tan[69]",
    type: "variable",
  },
  {
    label: "__fatal_tan[70]",
    type: "variable",
  },
  {
    label: "fatal_tan[70]",
    type: "variable",
  },
  {
    label: "__fatal_tan[71]",
    type: "variable",
  },
  {
    label: "fatal_tan[71]",
    type: "variable",
  },
  {
    label: "__fatal_tan[72]",
    type: "variable",
  },
  {
    label: "fatal_tan[72]",
    type: "variable",
  },
  {
    label: "__fatal_tan[73]",
    type: "variable",
  },
  {
    label: "fatal_tan[73]",
    type: "variable",
  },
  {
    label: "__fatal_tan[74]",
    type: "variable",
  },
  {
    label: "fatal_tan[74]",
    type: "variable",
  },
  {
    label: "__fatal_tan[75]",
    type: "variable",
  },
  {
    label: "fatal_tan[75]",
    type: "variable",
  },
  {
    label: "__fatal_tan[76]",
    type: "variable",
  },
  {
    label: "fatal_tan[76]",
    type: "variable",
  },
  {
    label: "__fatal_tan[77]",
    type: "variable",
  },
  {
    label: "fatal_tan[77]",
    type: "variable",
  },
  {
    label: "__fatal_tan[78]",
    type: "variable",
  },
  {
    label: "fatal_tan[78]",
    type: "variable",
  },
  {
    label: "__fatal_tan[79]",
    type: "variable",
  },
  {
    label: "fatal_tan[79]",
    type: "variable",
  },
  {
    label: "__fatal_tan[80]",
    type: "variable",
  },
  {
    label: "fatal_tan[80]",
    type: "variable",
  },
  {
    label: "__fatal_tan[81]",
    type: "variable",
  },
  {
    label: "fatal_tan[81]",
    type: "variable",
  },
  {
    label: "__fatal_tan[82]",
    type: "variable",
  },
  {
    label: "fatal_tan[82]",
    type: "variable",
  },
  {
    label: "__fatal_tan[83]",
    type: "variable",
  },
  {
    label: "fatal_tan[83]",
    type: "variable",
  },
  {
    label: "__fatal_tan[84]",
    type: "variable",
  },
  {
    label: "fatal_tan[84]",
    type: "variable",
  },
  {
    label: "__fatal_tan[85]",
    type: "variable",
  },
  {
    label: "fatal_tan[85]",
    type: "variable",
  },
  {
    label: "__fatal_tan[86]",
    type: "variable",
  },
  {
    label: "fatal_tan[86]",
    type: "variable",
  },
  {
    label: "__fatal_tan[87]",
    type: "variable",
  },
  {
    label: "fatal_tan[87]",
    type: "variable",
  },
  {
    label: "__fatal_tan[88]",
    type: "variable",
  },
  {
    label: "fatal_tan[88]",
    type: "variable",
  },
  {
    label: "__fatal_tan[89]",
    type: "variable",
  },
  {
    label: "fatal_tan[89]",
    type: "variable",
  },
  {
    label: "__fatal_tan[90]",
    type: "variable",
  },
  {
    label: "fatal_tan[90]",
    type: "variable",
  },
  {
    label: "__fatal_tan[91]",
    type: "variable",
  },
  {
    label: "fatal_tan[91]",
    type: "variable",
  },
  {
    label: "__fatal_tan[92]",
    type: "variable",
  },
  {
    label: "fatal_tan[92]",
    type: "variable",
  },
  {
    label: "__fatal_tan[93]",
    type: "variable",
  },
  {
    label: "fatal_tan[93]",
    type: "variable",
  },
  {
    label: "__fatal_tan[94]",
    type: "variable",
  },
  {
    label: "fatal_tan[94]",
    type: "variable",
  },
  {
    label: "__fatal_tan[95]",
    type: "variable",
  },
  {
    label: "fatal_tan[95]",
    type: "variable",
  },
  {
    label: "__fatal_tan[96]",
    type: "variable",
  },
  {
    label: "fatal_tan[96]",
    type: "variable",
  },
  {
    label: "__fatal_tan[97]",
    type: "variable",
  },
  {
    label: "fatal_tan[97]",
    type: "variable",
  },
  {
    label: "__fatal_tan[98]",
    type: "variable",
  },
  {
    label: "fatal_tan[98]",
    type: "variable",
  },
  {
    label: "__fatal_tan[99]",
    type: "variable",
  },
  {
    label: "fatal_tan[99]",
    type: "variable",
  },
  {
    label: "fatal_tan",
    type: "variable",
  },
  {
    label: "__wild_yellow[0]",
    type: "variable",
  },
  {
    label: "wild_yellow[0]",
    type: "variable",
  },
  {
    label: "__wild_yellow[1]",
    type: "variable",
  },
  {
    label: "wild_yellow[1]",
    type: "variable",
  },
  {
    label: "__wild_yellow[2]",
    type: "variable",
  },
  {
    label: "wild_yellow[2]",
    type: "variable",
  },
  {
    label: "__wild_yellow[3]",
    type: "variable",
  },
  {
    label: "wild_yellow[3]",
    type: "variable",
  },
  {
    label: "__wild_yellow[4]",
    type: "variable",
  },
  {
    label: "wild_yellow[4]",
    type: "variable",
  },
  {
    label: "__wild_yellow[5]",
    type: "variable",
  },
  {
    label: "wild_yellow[5]",
    type: "variable",
  },
  {
    label: "__wild_yellow[6]",
    type: "variable",
  },
  {
    label: "wild_yellow[6]",
    type: "variable",
  },
  {
    label: "__wild_yellow[7]",
    type: "variable",
  },
  {
    label: "wild_yellow[7]",
    type: "variable",
  },
  {
    label: "__wild_yellow[8]",
    type: "variable",
  },
  {
    label: "wild_yellow[8]",
    type: "variable",
  },
  {
    label: "__wild_yellow[9]",
    type: "variable",
  },
  {
    label: "wild_yellow[9]",
    type: "variable",
  },
  {
    label: "__wild_yellow[10]",
    type: "variable",
  },
  {
    label: "wild_yellow[10]",
    type: "variable",
  },
  {
    label: "__wild_yellow[11]",
    type: "variable",
  },
  {
    label: "wild_yellow[11]",
    type: "variable",
  },
  {
    label: "__wild_yellow[12]",
    type: "variable",
  },
  {
    label: "wild_yellow[12]",
    type: "variable",
  },
  {
    label: "__wild_yellow[13]",
    type: "variable",
  },
  {
    label: "wild_yellow[13]",
    type: "variable",
  },
  {
    label: "__wild_yellow[14]",
    type: "variable",
  },
  {
    label: "wild_yellow[14]",
    type: "variable",
  },
  {
    label: "__wild_yellow[15]",
    type: "variable",
  },
  {
    label: "wild_yellow[15]",
    type: "variable",
  },
  {
    label: "__wild_yellow[16]",
    type: "variable",
  },
  {
    label: "wild_yellow[16]",
    type: "variable",
  },
  {
    label: "__wild_yellow[17]",
    type: "variable",
  },
  {
    label: "wild_yellow[17]",
    type: "variable",
  },
  {
    label: "__wild_yellow[18]",
    type: "variable",
  },
  {
    label: "wild_yellow[18]",
    type: "variable",
  },
  {
    label: "__wild_yellow[19]",
    type: "variable",
  },
  {
    label: "wild_yellow[19]",
    type: "variable",
  },
  {
    label: "__wild_yellow[20]",
    type: "variable",
  },
  {
    label: "wild_yellow[20]",
    type: "variable",
  },
  {
    label: "__wild_yellow[21]",
    type: "variable",
  },
  {
    label: "wild_yellow[21]",
    type: "variable",
  },
  {
    label: "__wild_yellow[22]",
    type: "variable",
  },
  {
    label: "wild_yellow[22]",
    type: "variable",
  },
  {
    label: "__wild_yellow[23]",
    type: "variable",
  },
  {
    label: "wild_yellow[23]",
    type: "variable",
  },
  {
    label: "__wild_yellow[24]",
    type: "variable",
  },
  {
    label: "wild_yellow[24]",
    type: "variable",
  },
  {
    label: "__wild_yellow[25]",
    type: "variable",
  },
  {
    label: "wild_yellow[25]",
    type: "variable",
  },
  {
    label: "__wild_yellow[26]",
    type: "variable",
  },
  {
    label: "wild_yellow[26]",
    type: "variable",
  },
  {
    label: "__wild_yellow[27]",
    type: "variable",
  },
  {
    label: "wild_yellow[27]",
    type: "variable",
  },
  {
    label: "__wild_yellow[28]",
    type: "variable",
  },
  {
    label: "wild_yellow[28]",
    type: "variable",
  },
  {
    label: "__wild_yellow[29]",
    type: "variable",
  },
  {
    label: "wild_yellow[29]",
    type: "variable",
  },
  {
    label: "__wild_yellow[30]",
    type: "variable",
  },
  {
    label: "wild_yellow[30]",
    type: "variable",
  },
  {
    label: "__wild_yellow[31]",
    type: "variable",
  },
  {
    label: "wild_yellow[31]",
    type: "variable",
  },
  {
    label: "__wild_yellow[32]",
    type: "variable",
  },
  {
    label: "wild_yellow[32]",
    type: "variable",
  },
  {
    label: "__wild_yellow[33]",
    type: "variable",
  },
  {
    label: "wild_yellow[33]",
    type: "variable",
  },
  {
    label: "__wild_yellow[34]",
    type: "variable",
  },
  {
    label: "wild_yellow[34]",
    type: "variable",
  },
  {
    label: "__wild_yellow[35]",
    type: "variable",
  },
  {
    label: "wild_yellow[35]",
    type: "variable",
  },
  {
    label: "__wild_yellow[36]",
    type: "variable",
  },
  {
    label: "wild_yellow[36]",
    type: "variable",
  },
  {
    label: "__wild_yellow[37]",
    type: "variable",
  },
  {
    label: "wild_yellow[37]",
    type: "variable",
  },
  {
    label: "__wild_yellow[38]",
    type: "variable",
  },
  {
    label: "wild_yellow[38]",
    type: "variable",
  },
  {
    label: "__wild_yellow[39]",
    type: "variable",
  },
  {
    label: "wild_yellow[39]",
    type: "variable",
  },
  {
    label: "__wild_yellow[40]",
    type: "variable",
  },
  {
    label: "wild_yellow[40]",
    type: "variable",
  },
  {
    label: "__wild_yellow[41]",
    type: "variable",
  },
  {
    label: "wild_yellow[41]",
    type: "variable",
  },
  {
    label: "__wild_yellow[42]",
    type: "variable",
  },
  {
    label: "wild_yellow[42]",
    type: "variable",
  },
  {
    label: "__wild_yellow[43]",
    type: "variable",
  },
  {
    label: "wild_yellow[43]",
    type: "variable",
  },
  {
    label: "__wild_yellow[44]",
    type: "variable",
  },
  {
    label: "wild_yellow[44]",
    type: "variable",
  },
  {
    label: "__wild_yellow[45]",
    type: "variable",
  },
  {
    label: "wild_yellow[45]",
    type: "variable",
  },
  {
    label: "__wild_yellow[46]",
    type: "variable",
  },
  {
    label: "wild_yellow[46]",
    type: "variable",
  },
  {
    label: "__wild_yellow[47]",
    type: "variable",
  },
  {
    label: "wild_yellow[47]",
    type: "variable",
  },
  {
    label: "__wild_yellow[48]",
    type: "variable",
  },
  {
    label: "wild_yellow[48]",
    type: "variable",
  },
  {
    label: "__wild_yellow[49]",
    type: "variable",
  },
  {
    label: "wild_yellow[49]",
    type: "variable",
  },
  {
    label: "__wild_yellow[50]",
    type: "variable",
  },
  {
    label: "wild_yellow[50]",
    type: "variable",
  },
  {
    label: "__wild_yellow[51]",
    type: "variable",
  },
  {
    label: "wild_yellow[51]",
    type: "variable",
  },
  {
    label: "__wild_yellow[52]",
    type: "variable",
  },
  {
    label: "wild_yellow[52]",
    type: "variable",
  },
  {
    label: "__wild_yellow[53]",
    type: "variable",
  },
  {
    label: "wild_yellow[53]",
    type: "variable",
  },
  {
    label: "__wild_yellow[54]",
    type: "variable",
  },
  {
    label: "wild_yellow[54]",
    type: "variable",
  },
  {
    label: "__wild_yellow[55]",
    type: "variable",
  },
  {
    label: "wild_yellow[55]",
    type: "variable",
  },
  {
    label: "__wild_yellow[56]",
    type: "variable",
  },
  {
    label: "wild_yellow[56]",
    type: "variable",
  },
  {
    label: "__wild_yellow[57]",
    type: "variable",
  },
  {
    label: "wild_yellow[57]",
    type: "variable",
  },
  {
    label: "__wild_yellow[58]",
    type: "variable",
  },
  {
    label: "wild_yellow[58]",
    type: "variable",
  },
  {
    label: "__wild_yellow[59]",
    type: "variable",
  },
  {
    label: "wild_yellow[59]",
    type: "variable",
  },
  {
    label: "__wild_yellow[60]",
    type: "variable",
  },
  {
    label: "wild_yellow[60]",
    type: "variable",
  },
  {
    label: "__wild_yellow[61]",
    type: "variable",
  },
  {
    label: "wild_yellow[61]",
    type: "variable",
  },
  {
    label: "__wild_yellow[62]",
    type: "variable",
  },
  {
    label: "wild_yellow[62]",
    type: "variable",
  },
  {
    label: "__wild_yellow[63]",
    type: "variable",
  },
  {
    label: "wild_yellow[63]",
    type: "variable",
  },
  {
    label: "__wild_yellow[64]",
    type: "variable",
  },
  {
    label: "wild_yellow[64]",
    type: "variable",
  },
  {
    label: "__wild_yellow[65]",
    type: "variable",
  },
  {
    label: "wild_yellow[65]",
    type: "variable",
  },
  {
    label: "__wild_yellow[66]",
    type: "variable",
  },
  {
    label: "wild_yellow[66]",
    type: "variable",
  },
  {
    label: "__wild_yellow[67]",
    type: "variable",
  },
  {
    label: "wild_yellow[67]",
    type: "variable",
  },
  {
    label: "__wild_yellow[68]",
    type: "variable",
  },
  {
    label: "wild_yellow[68]",
    type: "variable",
  },
  {
    label: "__wild_yellow[69]",
    type: "variable",
  },
  {
    label: "wild_yellow[69]",
    type: "variable",
  },
  {
    label: "__wild_yellow[70]",
    type: "variable",
  },
  {
    label: "wild_yellow[70]",
    type: "variable",
  },
  {
    label: "__wild_yellow[71]",
    type: "variable",
  },
  {
    label: "wild_yellow[71]",
    type: "variable",
  },
  {
    label: "__wild_yellow[72]",
    type: "variable",
  },
  {
    label: "wild_yellow[72]",
    type: "variable",
  },
  {
    label: "__wild_yellow[73]",
    type: "variable",
  },
  {
    label: "wild_yellow[73]",
    type: "variable",
  },
  {
    label: "__wild_yellow[74]",
    type: "variable",
  },
  {
    label: "wild_yellow[74]",
    type: "variable",
  },
  {
    label: "__wild_yellow[75]",
    type: "variable",
  },
  {
    label: "wild_yellow[75]",
    type: "variable",
  },
  {
    label: "__wild_yellow[76]",
    type: "variable",
  },
  {
    label: "wild_yellow[76]",
    type: "variable",
  },
  {
    label: "__wild_yellow[77]",
    type: "variable",
  },
  {
    label: "wild_yellow[77]",
    type: "variable",
  },
  {
    label: "__wild_yellow[78]",
    type: "variable",
  },
  {
    label: "wild_yellow[78]",
    type: "variable",
  },
  {
    label: "__wild_yellow[79]",
    type: "variable",
  },
  {
    label: "wild_yellow[79]",
    type: "variable",
  },
  {
    label: "__wild_yellow[80]",
    type: "variable",
  },
  {
    label: "wild_yellow[80]",
    type: "variable",
  },
  {
    label: "__wild_yellow[81]",
    type: "variable",
  },
  {
    label: "wild_yellow[81]",
    type: "variable",
  },
  {
    label: "__wild_yellow[82]",
    type: "variable",
  },
  {
    label: "wild_yellow[82]",
    type: "variable",
  },
  {
    label: "__wild_yellow[83]",
    type: "variable",
  },
  {
    label: "wild_yellow[83]",
    type: "variable",
  },
  {
    label: "__wild_yellow[84]",
    type: "variable",
  },
  {
    label: "wild_yellow[84]",
    type: "variable",
  },
  {
    label: "__wild_yellow[85]",
    type: "variable",
  },
  {
    label: "wild_yellow[85]",
    type: "variable",
  },
  {
    label: "__wild_yellow[86]",
    type: "variable",
  },
  {
    label: "wild_yellow[86]",
    type: "variable",
  },
  {
    label: "__wild_yellow[87]",
    type: "variable",
  },
  {
    label: "wild_yellow[87]",
    type: "variable",
  },
  {
    label: "__wild_yellow[88]",
    type: "variable",
  },
  {
    label: "wild_yellow[88]",
    type: "variable",
  },
  {
    label: "__wild_yellow[89]",
    type: "variable",
  },
  {
    label: "wild_yellow[89]",
    type: "variable",
  },
  {
    label: "__wild_yellow[90]",
    type: "variable",
  },
  {
    label: "wild_yellow[90]",
    type: "variable",
  },
  {
    label: "__wild_yellow[91]",
    type: "variable",
  },
  {
    label: "wild_yellow[91]",
    type: "variable",
  },
  {
    label: "__wild_yellow[92]",
    type: "variable",
  },
  {
    label: "wild_yellow[92]",
    type: "variable",
  },
  {
    label: "__wild_yellow[93]",
    type: "variable",
  },
  {
    label: "wild_yellow[93]",
    type: "variable",
  },
  {
    label: "__wild_yellow[94]",
    type: "variable",
  },
  {
    label: "wild_yellow[94]",
    type: "variable",
  },
  {
    label: "__wild_yellow[95]",
    type: "variable",
  },
  {
    label: "wild_yellow[95]",
    type: "variable",
  },
  {
    label: "__wild_yellow[96]",
    type: "variable",
  },
  {
    label: "wild_yellow[96]",
    type: "variable",
  },
  {
    label: "__wild_yellow[97]",
    type: "variable",
  },
  {
    label: "wild_yellow[97]",
    type: "variable",
  },
  {
    label: "__wild_yellow[98]",
    type: "variable",
  },
  {
    label: "wild_yellow[98]",
    type: "variable",
  },
  {
    label: "__wild_yellow[99]",
    type: "variable",
  },
  {
    label: "wild_yellow[99]",
    type: "variable",
  },
  {
    label: "wild_yellow",
    type: "variable",
  },
  {
    label: "__oral_red",
    type: "variable",
  },
  {
    label: "oral_red",
    type: "variable",
  },
  {
    label: "__remarkable_salmon",
    type: "variable",
  },
  {
    label: "remarkable_salmon",
    type: "variable",
  },
  {
    label: "__elaborate_blush",
    type: "variable",
  },
  {
    label: "elaborate_blush",
    type: "variable",
  },
  {
    label: "__mental_silver",
    type: "variable",
  },
  {
    label: "mental_silver",
    type: "variable",
  },
  {
    label: "__wily_violet",
    type: "variable",
  },
  {
    label: "wily_violet",
    type: "variable",
  },
  {
    label: "__metropolitan_rose",
    type: "variable",
  },
  {
    label: "metropolitan_rose",
    type: "variable",
  },
  {
    label: "__peaceful_violet",
    type: "variable",
  },
  {
    label: "peaceful_violet",
    type: "variable",
  },
  {
    label: "__juicy_blue",
    type: "variable",
  },
  {
    label: "juicy_blue",
    type: "variable",
  },
  {
    label: "__circular_ivory",
    type: "variable",
  },
  {
    label: "circular_ivory",
    type: "variable",
  },
  {
    label: "__willing_coral",
    type: "variable",
  },
  {
    label: "willing_coral",
    type: "variable",
  },
  {
    label: "__ideal_chocolate",
    type: "variable",
  },
  {
    label: "ideal_chocolate",
    type: "variable",
  },
  {
    label: "__reluctant_amber",
    type: "variable",
  },
  {
    label: "reluctant_amber",
    type: "variable",
  },
  {
    label: "__revolutionary_peach",
    type: "variable",
  },
  {
    label: "revolutionary_peach",
    type: "variable",
  },
  {
    label: "__skinny_blush",
    type: "variable",
  },
  {
    label: "skinny_blush",
    type: "variable",
  },
  {
    label: "__ugly_silver",
    type: "variable",
  },
  {
    label: "ugly_silver",
    type: "variable",
  },
  {
    label: "__eventual_amethyst",
    type: "variable",
  },
  {
    label: "eventual_amethyst",
    type: "variable",
  },
  {
    label: "__radical_gold",
    type: "variable",
  },
  {
    label: "radical_gold",
    type: "variable",
  },
  {
    label: "__front_amaranth",
    type: "variable",
  },
  {
    label: "front_amaranth",
    type: "variable",
  },
  {
    label: "__back_moccasin",
    type: "variable",
  },
  {
    label: "back_moccasin",
    type: "variable",
  },
  {
    label: "__specified_coral",
    type: "variable",
  },
  {
    label: "specified_coral",
    type: "variable",
  },
  {
    label: "__negative_amber",
    type: "variable",
  },
  {
    label: "negative_amber",
    type: "variable",
  },
  {
    label: "__yielding_aquamarine",
    type: "variable",
  },
  {
    label: "yielding_aquamarine",
    type: "variable",
  },
  {
    label: "__itchy_tomato",
    type: "variable",
  },
  {
    label: "itchy_tomato",
    type: "variable",
  },
  {
    label: "__explicit_silver",
    type: "variable",
  },
  {
    label: "explicit_silver",
    type: "variable",
  },
  {
    label: "__underlying_white",
    type: "variable",
  },
  {
    label: "__inquisitive_sapphire",
    type: "variable",
  },
  {
    label: "inquisitive_sapphire",
    type: "variable",
  },
  {
    label: "__well_blush",
    type: "variable",
  },
  {
    label: "well_blush",
    type: "variable",
  },
  {
    label: "__dizzy_aquamarine",
    type: "variable",
  },
  {
    label: "dizzy_aquamarine",
    type: "variable",
  },
  {
    label: "__xenophobic_coffee",
    type: "variable",
  },
  {
    label: "xenophobic_coffee",
    type: "variable",
  },
  {
    label: "__fundamental_orange",
    type: "variable",
  },
  {
    label: "fundamental_orange",
    type: "variable",
  },
  {
    label: "__impressed_aquamarine",
    type: "variable",
  },
  {
    label: "impressed_aquamarine",
    type: "variable",
  },
  {
    label: "__package__",
    type: "Method",
  },
  {
    label: "__spec__",
    type: "Method",
  },
  {
    label: "__cached__",
    type: "Method",
  },
  {
    label: "__dict__",
    type: "Method",
  },
  {
    label: "__doc__",
    type: "Method",
  },
  {
    label: "Conv1d",
    type: "Property",
  },
  {
    label: "Conv2d",
    type: "Property",
  },
  {
    label: "Conv3d",
    type: "Property",
  },
  {
    label: "ConvTranspose1d",
    type: "Property",
  },
  {
    label: "ConvTranspose2d",
    type: "Property",
  },
  {
    label: "ConvTranspose3d",
    type: "Property",
  },
  {
    label: "CELU",
    type: "Property",
  },
  {
    label: "BCELoss",
    type: "Property",
  },
  {
    label: "BCEWithLogitsLoss",
    type: "Property",
  },
  {
    label: "CosineEmbeddingLoss",
    type: "Property",
  },
  {
    label: "CTCLoss",
    type: "Property",
  },
  {
    label: "CrossEntropyLoss",
    type: "Property",
  },
  {
    label: "Container",
    type: "Property",
  },
  {
    label: "ModuleDict",
    type: "Property",
  },
  {
    label: "ParameterDict",
    type: "Property",
  },
  {
    label: "FractionalMaxPool2d",
    type: "Property",
  },
  {
    label: "FractionalMaxPool3d",
    type: "Property",
  },
  {
    label: "LocalResponseNorm",
    type: "Property",
  },
  {
    label: "BatchNorm1d",
    type: "Property",
  },
  {
    label: "BatchNorm2d",
    type: "Property",
  },
  {
    label: "BatchNorm3d",
    type: "Property",
  },
  {
    label: "InstanceNorm1d",
    type: "Property",
  },
  {
    label: "InstanceNorm2d",
    type: "Property",
  },
  {
    label: "InstanceNorm3d",
    type: "Property",
  },
  {
    label: "SyncBatchNorm",
    type: "Property",
  },
  {
    label: "ReflectionPad1d",
    type: "Property",
  },
  {
    label: "ReflectionPad2d",
    type: "Property",
  },
  {
    label: "ReflectionPad3d",
    type: "Property",
  },
  {
    label: "ReplicationPad2d",
    type: "Property",
  },
  {
    label: "ReplicationPad1d",
    type: "Property",
  },
  {
    label: "ReplicationPad3d",
    type: "Property",
  },
  {
    label: "CrossMapLRN2d",
    type: "Property",
  },
  {
    label: "RNNCellBase",
    type: "Property",
  },
  {
    label: "RNNCell",
    type: "Property",
  },
  {
    label: "LSTMCell",
    type: "Property",
  },
  {
    label: "GRUCell",
    type: "Property",
  },
  {
    label: "PairwiseDistance",
    type: "Property",
  },
  {
    label: "ConstantPad1d",
    type: "Property",
  },
  {
    label: "ConstantPad2d",
    type: "Property",
  },
  {
    label: "ConstantPad3d",
    type: "Property",
  },
  {
    label: "CosineSimilarity",
    type: "Property",
  },
  {
    label: "TransformerEncoder",
    type: "Property",
  },
  {
    label: "TransformerDecoder",
    type: "Property",
  },
  {
    label: "TransformerEncoderLayer",
    type: "Property",
  },
  {
    label: "TransformerDecoderLayer",
    type: "Property",
  },
  {
    label: "LazyConv1d",
    type: "Property",
  },
  {
    label: "LazyConv2d",
    type: "Property",
  },
  {
    label: "LazyConv3d",
    type: "Property",
  },
  {
    label: "LazyConvTranspose1d",
    type: "Property",
  },
  {
    label: "LazyConvTranspose2d",
    type: "Property",
  },
  {
    label: "LazyConvTranspose3d",
    type: "Property",
  },
  {
    label: "LazyBatchNorm1d",
    type: "Property",
  },
  {
    label: "LazyBatchNorm2d",
    type: "Property",
  },
  {
    label: "LazyBatchNorm3d",
    type: "Property",
  },
  {
    label: "LazyInstanceNorm1d",
    type: "Property",
  },
  {
    label: "LazyInstanceNorm2d",
    type: "Property",
  },
  {
    label: "LazyInstanceNorm3d",
    type: "Property",
  },
  {
    label: "TripletMarginWithDistanceLoss",
    type: "Property",
  },
  {
    label: "ChannelShuffle",
    type: "Property",
  },
  {
    label: "CircularPad1d",
    type: "Property",
  },
  {
    label: "CircularPad2d",
    type: "Property",
  },
  {
    label: "CircularPad3d",
    type: "Property",
  },
  {
    label: "functional",
    type: "Constructor",
  },
  {
    label: "factory_kwargs",
    type: "Namespace",
  },
];
