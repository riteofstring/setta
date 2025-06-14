import { sendMessageAndWait } from "state/actions/temporaryMiscState";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { createNewId } from "utils/idNameCreation";

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
