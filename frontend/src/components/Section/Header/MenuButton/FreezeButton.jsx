import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setCodeInfoFrozen } from "state/actions/codeInfo";
import { updateParams } from "state/actions/sections/sectionContents";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionToParams } from "state/definitions";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const params = useSectionToParams.getState().params[sectionId];
    setCodeInfoFrozen({ ids: params.map((x) => x.id), isFrozen: true });
    setSectionInfoAttr({ sectionId, attr: "isFrozen", value: true });
    updateParams(sectionId);
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
