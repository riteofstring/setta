import { MenuItem } from "./DropdownMenuItem";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import { route_ungroup_groups } from "utils/generatedEndpoints";

export function UngroupButton({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  function onClick() {
    if (!canEditStructure) {
      return;
    }
    route_ungroup_groups({
      projectConfigId: getCurrProjectConfigId(),
      groupIds: [sectionId],
    });
  }

  return (
    <MenuItem onClick={onClick} disabled={!canEditStructure}>
      Ungroup
    </MenuItem>
  );
}
