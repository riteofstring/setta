import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroup } from "state/actions/sections/groupSections";

export function UngroupButton({ sectionId }) {
  function onClick() {
    ungroup(sectionId);
  }

  return <MenuItem onClick={onClick}>Ungroup</MenuItem>;
}
