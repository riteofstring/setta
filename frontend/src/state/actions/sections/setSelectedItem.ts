import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_callable } from "utils/generatedEndpoints";
import { setParametersRequestWaitingForLSP } from "../lsp";

export async function setCallable(
  sectionId: string,
  callableName: string,
  refetchParams = false,
) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  const projectConfigId = useProjectState.getState().projectConfig.id;
  const res = await route_set_callable({
    projectConfigId,
    sectionId,
    callableName,
    refetchParams,
  });
  if (res200(res)) {
    // state update occurs by websocket
    setToNotWaiting();
  }
}
