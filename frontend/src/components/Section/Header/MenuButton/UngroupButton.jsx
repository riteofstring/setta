import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroupGroup } from "state/actions/sections/groupSections";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useProjectState } from "state/definitions";

export function UngroupButton({ sectionId }) {
  function onClick() {
    useProjectState.setState((state) => {
      ungroupGroup(sectionId, state);
    });
    maybeIncrementProjectStateVersion(true);
  }

  return <MenuItem onClick={onClick}>Ungroup</MenuItem>;
}
