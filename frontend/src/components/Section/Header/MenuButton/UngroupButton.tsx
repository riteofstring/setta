import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { route_ungroup_groups } from "utils/generatedEndpoints";

export function UngroupButton({ sectionId }) {
  function onClick() {
    route_ungroup_groups({
      projectConfigId: getCurrProjectConfigId(),
      groupIds: [sectionId],
    });
  }

  return <MenuItem onClick={onClick}>Ungroup</MenuItem>;
}
