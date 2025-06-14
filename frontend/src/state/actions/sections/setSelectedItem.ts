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
  // res.data is true on success.
  // state update occurs by websocket
  const res = await route_set_selected_item({
    projectConfigId,
    sectionId,
    selectedItemName,
    refetchParams,
  });
  if (res200(res) && res.data) {
    setToNotWaiting();
  }
}
