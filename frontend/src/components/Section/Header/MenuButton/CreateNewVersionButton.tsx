import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useProjectState } from "state/definitions";
import { route_create_new_section_version } from "utils/generatedEndpoints";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    route_create_new_section_version({
      projectConfigId: useProjectState.getState().projectConfig.id,
      sectionId,
    });
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
