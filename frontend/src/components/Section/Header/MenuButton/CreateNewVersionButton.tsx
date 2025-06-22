import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createNewVersion } from "state/actions/newVersion";
import { useProjectState } from "state/definitions";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    useProjectState.setState((state) => createNewVersion(state, sectionId));
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
