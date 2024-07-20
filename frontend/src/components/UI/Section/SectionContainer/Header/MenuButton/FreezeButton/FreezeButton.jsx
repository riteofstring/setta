import { useCodeInfo } from "state/definitions/codeInfo";
import { useSectionToParams } from "state/definitions/sectionToParams";
import { updateParams } from "state/actions/sectionContents";
import { setSectionInfoAttr } from "state/actions/setters";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const params = useSectionToParams.getState().params[sectionId];
    useCodeInfo
      .getState()
      .setIsFrozen({ ids: params.map((x) => x.id), isFrozen: true });
    setSectionInfoAttr({ sectionId, attr: "isFrozen", value: true });
    updateParams(sectionId);
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
