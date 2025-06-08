import { useProjectState, useSettings } from "state/definitions";
import { RenameRefactorModeEnum } from "utils/generatedTypes";
import { openRenameReferencesModal } from "./modal";
import { getSectionVariant } from "./sectionInfos";
import { maybeIncrementProjectStateVersion } from "./undo";

export function processRenameRefactorResults(changedValues) {
  const renameMode = useSettings.getState().backend.renameRefactorMode;
  // this shouldn't ever be true, but good to be safe I guess
  if (renameMode === RenameRefactorModeEnum.NEVER_RENAME) {
    return;
  }
  if (renameMode === RenameRefactorModeEnum.ALWAYS_ASK) {
    openRenameReferencesModal(changedValues);
    return;
  }

  makeReplacements(changedValues);
}

export async function makeReplacements(changedValues) {
  useProjectState.setState((state) => {
    for (const c of changedValues) {
      const { sectionId, paramInfoId, value } = c;
      const { selectedItem, values } = getSectionVariant(sectionId, state);
      // changing name of callable
      if (!paramInfoId) {
        state.codeInfo[selectedItem].name = value;
      } else if (paramInfoId) {
        values[paramInfoId].value = value;
      }
    }
  });

  maybeIncrementProjectStateVersion(true);
}
