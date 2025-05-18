import C from "constants/constants.json";
import { addTemporaryNotification } from "state/actions/notifications";
import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useProjectState, useTypeErrors } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { post } from "./utils";

export async function dbRequestTypeCheck(userRequested = false) {
  if (userRequested) {
    addTemporaryNotification("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  post({
    body: { projectConfigId },
    address: C.ROUTE_TYPE_CHECK,
  });
}

export async function wsParametersRequest({ sectionId, fullText }) {
  const { id: projectConfigId } = useProjectState.getState().projectConfig;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_PARAMETERS_REQUEST,
    content: {
      projectConfigId,
      sectionId,
      fullText,
    },
  });
}

export async function wsCodeAreaCompletion({ sectionId, fullText, position }) {
  const { id: projectConfigId } = useProjectState.getState().projectConfig;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_CODE_AREA_AUTOCOMPLETE,
    content: {
      projectConfigId,
      sectionId,
      fullText,
      position,
    },
  });
}

export async function wsTextFieldCompletion({
  sectionId,
  paramInfoId,
  fullText,
  position,
}) {
  const { id: projectConfigId } = useProjectState.getState().projectConfig;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_TEXT_FIELD_AUTOCOMPLETE,
    content: {
      projectConfigId,
      sectionId,
      paramInfoId,
      fullText,
      position,
    },
  });
}

export async function wsGenCodePrefixCompletion({ fullText, position }) {
  const { id: projectConfigId } = useProjectState.getState().projectConfig;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_GEN_CODE_PREFIX_AUTOCOMPLETE,
    content: {
      projectConfigId,
      fullText,
      position,
    },
  });
}
