import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroupGroup } from "state/actions/sections/groupSections";
import { useProjectState } from "state/definitions";

export function UngroupButton({ sectionId }) {
  function onClick() {
    useProjectState.setState((state) => {
      ungroupGroup(sectionId, state);
    });
  }

  return <MenuItem onClick={onClick}>Ungroup</MenuItem>;
}
