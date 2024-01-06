import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import { updateParams } from "thunks/sections/sectionContents";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const params = useSectionToParams.getState().params[sectionId];
    useCodeInfo
      .getState()
      .setIsFrozen({ ids: params.map((x) => x.id), isFrozen: true });
    updateParams(sectionId);
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
