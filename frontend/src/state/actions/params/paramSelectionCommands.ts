import {
  toggleParamSelected,
  unselectAllParams,
} from "state/actions/projectStateCommands";
import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionEffectiveImplSelectors";
import { useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

export function selectOnlyParam(sectionId: string, paramId: string): void {
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (impl.selectedParams.length === 1 && impl.selectedParams[0] === paramId) {
    return;
  }
  unselectAllParams();
  toggleParamSelected(sectionId, paramId);
}
