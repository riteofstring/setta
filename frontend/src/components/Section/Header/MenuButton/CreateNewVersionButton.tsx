import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createNewSectionVersion } from "state/actions/newVersion";
import { useProjectState } from "state/definitions";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    useProjectState.setState((state) => createNewSectionVersion(state, sectionId));
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
