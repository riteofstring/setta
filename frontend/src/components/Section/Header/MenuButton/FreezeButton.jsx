import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setCodeInfoFrozen } from "state/actions/codeInfo";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionToParamIds } from "state/definitions";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const ids = useSectionToParamIds.getState().params[sectionId];
    setCodeInfoFrozen({ ids, isFrozen: true });
    setSectionInfoAttr({ sectionId, attr: "isFrozen", value: true });
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
