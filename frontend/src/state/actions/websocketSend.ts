import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { createNewId } from "utils/idNameCreation";

export async function wsSetSelectedItem(
  sectionId: string,
  selectedItemName: string,
  refetchParams: boolean = false,
) {
  const projectConfigId = useProjectState.getState().projectConfig.id;

  return await sendMessageAndWait({
    id: createNewId(),
    messageType: C.WS_SET_SELECTED_ITEM,
    content: {
      projectConfigId,
      sectionId,
      selectedItemName,
      refetchParams,
    },
  });
}

export async function wsCodeAreaCompletion({ sectionId, fullText, position }) {
  const projectConfigId = useProjectState.getState().projectConfig.id;

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
  const projectConfigId = useProjectState.getState().projectConfig.id;

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

export async function wsClearTextFieldCompletion({ sectionId, paramInfoId }) {
  const projectConfigId = useProjectState.getState().projectConfig.id;

  sendMessage({
    id: createNewId(),
    messageType: C.WS_CLEAR_TEXT_FIELD_COMPLETION,
    content: {
      projectConfigId,
      sectionId,
      paramInfoId,
    },
  });
}

export async function wsGenCodePrefixCompletion({ fullText, position }) {
  const projectConfigId = useProjectState.getState().projectConfig.id;

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
