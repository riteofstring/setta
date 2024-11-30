import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { createNewVersion } from "state/actions/newVersion";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    createNewVersion(sectionId);
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
