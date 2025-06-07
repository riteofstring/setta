import { wsSetSelectedItem } from "requests/sections";
import { useProjectState } from "state/definitions";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { updateProjectState } from "../sectionInfos";

export async function setSelectedItem(
  sectionId,
  selectedItemName,
  refetchParams = false,
) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  const newProjectState = await wsSetSelectedItem(
    sectionId,
    selectedItemName,
    refetchParams,
  );
  if (newProjectState) {
    console.log(newProjectState);
    useProjectState.setState((state) => {
      updateProjectState({ ...newProjectState, state });
    });
  }
  setToNotWaiting();
}
