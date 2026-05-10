import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { resetSectionsToDefaultVersions } from "state/actions/sectionInfos";

export function ResetToDefaultVersion({ sectionId }) {
  function onClick() {
    resetSectionsToDefaultVersions([sectionId]);
  }

  return <MenuItem onClick={onClick}>Reset To Default Version</MenuItem>;
}
