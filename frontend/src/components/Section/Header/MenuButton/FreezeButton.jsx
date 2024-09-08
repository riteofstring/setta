import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setCodeInfoFrozen } from "state/actions/codeInfo";
import { getAllParamInfos } from "state/actions/sections/sectionContents";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";

export function FreezeButton({ sectionId }) {
  function onClick() {
    const ids = getAllParamInfos(sectionId);
    setCodeInfoFrozen({ ids, isFrozen: true });
    setSectionInfoAttr({ sectionId, attr: "isFrozen", value: true });
  }

  return <MenuItem onClick={onClick}>Freeze</MenuItem>;
}
