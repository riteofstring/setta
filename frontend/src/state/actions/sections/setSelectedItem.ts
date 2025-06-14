import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_selected_item } from "utils/generatedEndpoints";
import { setParametersRequestWaitingForLSP } from "../lsp";

export async function setSelectedItem(
  sectionId,
  selectedItemName,
  refetchParams = false,
) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  const projectConfigId = useProjectState.getState().projectConfig.id;
  const res = await route_set_selected_item({
    projectConfigId,
    sectionId,
    selectedItemName,
    refetchParams,
  });
  if (res200(res)) {
    // state update occurs by websocket
    setToNotWaiting();
  }
}
