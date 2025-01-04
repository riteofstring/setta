import {
  constructEVRefs,
  constructTemplateVars,
  findCandidateEVRefs,
  findCandidateTemplateVars,
} from "components/Utils/CodeMirror/utils";
import C from "constants/constants.json";
import _ from "lodash";
import { setNotificationMessage } from "state/actions/notification";
import { getProjectDataToGenerateCode } from "state/actions/project/generateCode";
import { getSectionInfo } from "state/actions/sectionInfos";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useProjectConfig, useTypeErrors } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { sendMessage } from "./websocket";

export function dbRequestTypeCheck(userRequested = false) {
  if (userRequested) {
    setNotificationMessage("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const project = getProjectDataToGenerateCode({});
  sendMessage({
    content: project,
    id: createNewId(),
    messageType: "typeCheck",
  });
}

export const debouncedTypeCheckRequest = _.debounce(dbRequestTypeCheck, 500);

export async function dbParametersRequest({
  sectionId,
  fullText,
  beforeText,
  position,
  evRefs,
}) {
  const projectConfigId = useProjectConfig.getState().id;
  return await sendMessageAndWait({
    id: createNewId(),
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
  await sendMessage({
    id: createNewId(),
    messageType: "textFieldInitializeCode",
    content: { project, sectionId, paramInfoId },
  });
}

export async function dbCodeAreaInitializeCode(sectionId) {
  const project = getProjectDataToGenerateCode({});
  return await sendMessageAndWait({
    id: createNewId(),
    messageType: "codeAreaInitializeCode",
    content: { project, sectionId },
  });
}

export async function dbCodeAreaCompletion({
  sectionId,
  fullText,
  beforeText,
  position,
  setEVRefs,
  codeLanguage,
}) {
  const { id: projectConfigId, name: projectConfigName } =
    useProjectConfig.getState();
  const { name: sectionName } = getSectionInfo(sectionId);

  const { evRefs, templateVars } = await getEVRefsAndTemplateVarsForCodeArea(
    sectionId,
    fullText,
  );

  setEVRefs(evRefs);

  const autoCompleteProps = {
    id: createNewId(),
    messageType: "codeAreaAutocomplete",
    content: {
      projectConfigId,
      projectConfigName,
      codeLanguage,
      sectionId,
      sectionName,
      fullText,
      beforeText,
      position,
      evRefs,
      templateVars,
    },
  };

  const res = await sendMessageAndWait(autoCompleteProps);

  if (res === C.CODE_AREA_GEN_CODE_NOT_INITIALIZED) {
    const initialized = await dbCodeAreaInitializeCode(sectionId);
    if (initialized) {
      return await sendMessageAndWait(autoCompleteProps);
    } else {
      console.log("dbCodeAreaCompletion initialization failed!");
      return [];
    }
  }
  return res;
}

export async function dbTextFieldCompletion({
  sectionId,
  paramInfoId,
  fullText,
  beforeText,
  position,
  setEVRefs,
}) {
  const { id: projectConfigId, name: projectConfigName } =
    useProjectConfig.getState();
  const evRefs = await getEVRefs({
    sectionId,
    paramInfoId,
    fullText,
  });

  setEVRefs(evRefs);

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: "textFieldCompletion",
    content: {
      projectConfigId,
      projectConfigName,
      sectionId,
      paramInfoId,
      fullText,
      beforeText,
      position,
      evRefs,
    },
  });
}

export async function getEVRefs({
  sectionId,
  paramInfoId,
  fullText,
  regexPatternKey = "pattern",
  templateVars = null,
  onlyAfterGenCodeTemplateVar = false,
}) {
  let evRefs = [];
  let keywordPositions = [];
  const candidateEVRefs = findCandidateEVRefs({
    sectionId,
    paramInfoId,
    value: fullText,
    regexPatternKey,
  });
  console.log("candidateEVRefs", candidateEVRefs);
  if (candidateEVRefs.length > 0) {
    let count = 0;
    keywordPositions = [];
    await sendMessageAndWait({
      id: createNewId(),
      messageType: "findEVRefs",
      content: {
        sectionId,
        paramInfoId,
        candidateEVRefs,
        fullText,
        templateVars,
        onlyAfterGenCodeTemplateVar,
      },
      condition: (x) => {
        keywordPositions.push(...x);
        count += 1;
        return count === candidateEVRefs.length;
      },
    });

    // CodeMirror's RangeSetBuilder needs the list to be sorted
    keywordPositions.sort((a, b) => a.startPos - b.startPos);

    evRefs = constructEVRefs(keywordPositions, fullText);

    console.log("evRefs", evRefs);
  }

  return evRefs;
}

async function getTemplateVars(sectionId, fullText) {
  let templateVars = [];
  let keywordPositions = [];
  const candidateTemplateVars = findCandidateTemplateVars(sectionId, fullText);
  console.log("candidateTemplateVars", candidateTemplateVars);
  if (candidateTemplateVars.length > 0) {
    let count = 0;
    keywordPositions = [];
    await sendMessageAndWait({
      id: createNewId(),
      messageType: "codeAreaFindTemplateVars",
      content: { sectionId, candidateTemplateVars, fullText },
      condition: (x) => {
        if (x !== null) {
          keywordPositions.push(x);
        }
        count += 1;
        return count === candidateTemplateVars.length;
      },
    });

    // CodeMirror's RangeSetBuilder needs the list to be sorted
    keywordPositions.sort((a, b) => a.startPos - b.startPos);

    templateVars = constructTemplateVars(keywordPositions, fullText);

    console.log("templateVars", templateVars);
  }

  return templateVars;
}

export async function getEVRefsAndTemplateVarsForCodeArea(sectionId, value) {
  const templateVars = await getTemplateVars(sectionId, value);

  const evRefs = await getEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    regexPatternKey: "codeAreaPattern",
    templateVars,
    onlyAfterGenCodeTemplateVar: true,
  });

  return { templateVars, evRefs };
}
