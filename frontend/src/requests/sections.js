import C from "constants/constants.json";
import { addTemporaryNotification } from "state/actions/notifications";
import { getSectionInfo } from "state/actions/sectionInfos";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useSectionInfos, useTypeErrors } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { asyncDebounce } from "utils/utils";
import { post } from "./utils";

export async function dbRequestTypeCheck(userRequested = false) {
  if (userRequested) {
    addTemporaryNotification("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const projectConfigId = useSectionInfos.getState().projectConfig.id;
  post({
    body: { projectConfigId },
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

export async function dbCodeAreaCompletion({
  sectionId,
  fullText,
  position,
  codeLanguage,
}) {
  const { id: projectConfigId, name: projectConfigName } =
    useSectionInfos.getState().projectConfig;
  const { name: sectionName } = getSectionInfo(sectionId);

  return await sendMessageAndWait({
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
  });
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
