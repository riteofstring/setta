import { setCodeInfoFrozen } from "state/actions/codeInfo";
import { updateParams } from "state/actions/sectionContents";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { useSectionToParams } from "state/definitions";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const params = useSectionToParams.getState().params[sectionId];
    setCodeInfoFrozen({ ids: params.map((x) => x.id), isFrozen: true });
    setSectionInfoAttr({ sectionId, attr: "isFrozen", value: true });
    updateParams(sectionId);
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
