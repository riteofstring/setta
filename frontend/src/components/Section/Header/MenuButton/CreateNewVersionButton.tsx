import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { route_create_new_section_version } from "utils/generatedEndpoints";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    route_create_new_section_version({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
    });
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
