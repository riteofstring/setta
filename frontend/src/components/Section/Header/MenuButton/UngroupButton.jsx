import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroup } from "state/actions/sections/groupSections";

export function UngroupButton({ sectionId }) {
  function onClick() {
    ungroup(sectionId);
  }

  return (
    <MenuItem
      onClick={(e) => {
        // Need to stop propagation for this Group button
        // because the onClick in ContainerCore gets triggered for some reason
        // whereas that's not the case with regular sections.
        e.stopPropagation();
        onClick(e);
      }}
    >
      Ungroup
    </MenuItem>
  );
}
