import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroup } from "state/actions/sections/groupSections";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";

export function UngroupButton({ sectionId }) {
  function onClick() {
    useSectionInfos.setState((state) => {
      ungroup(sectionId, state);
    });
    maybeIncrementProjectStateVersion(true);
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
