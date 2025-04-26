import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroupGroup } from "state/actions/sections/groupSections";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";

export function UngroupButton({ sectionId }) {
  function onClick() {
    useSectionInfos.setState((state) => {
      ungroupGroup(sectionId, state);
    });
    maybeIncrementProjectStateVersion(true);
  }

  return <MenuItem onClick={onClick}>Ungroup</MenuItem>;
}
