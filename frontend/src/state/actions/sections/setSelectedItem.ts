import { wsSetSelectedItem } from "requests/sections";
import { useProjectState } from "state/definitions";
import { setParametersRequestWaitingForLSP } from "../lsp";
import { getSectionVariant, updateProjectState } from "../sectionInfos";
import { getSectionCurrentCodeInfoMcp } from "./sectionContents";

/**
 * Sets the selectedItem (i.e. the callable) of a section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section we're setting the selectedItem of.
 * @param {string} selectedItemName The selected item name, for example "math.sqrt"
 * @returns {SectionSimplifiedCodeInfo} the callable info and info about its parameters.
 */
export async function setSelectedItemMcp({ sectionId, selectedItemName }) {
  function callbackSetAttr(id, state) {
    // for this callback, an undefined id means that the selectedItem is already selected.
    if (id !== undefined) {
      getSectionVariant(sectionId, state).selectedItem = id;
    }
  }
  await setSelectedItem(
    sectionId,
    sectionId,
    selectedItemName,
    callbackSetAttr,
  );

  return getSectionCurrentCodeInfoMcp({ sectionId });
}

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
    useProjectState.setState((state) => {
      updateProjectState({ ...newProjectState, state });
    });
  }
  setToNotWaiting();
}
