import { useCodeInfo } from "models/info/codeInfo";
import { useSectionToParams } from "models/info/sectionToParams";
import { updateParams } from "state/sectionInfos/actions/sectionContents";
import { setSectionInfoAttr } from "state/sectionInfos/actions/setters";
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
