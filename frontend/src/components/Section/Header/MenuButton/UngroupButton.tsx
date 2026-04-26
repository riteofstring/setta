import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { ungroupGroups } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
export function UngroupButton({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  function onClick() {
    if (!canEditStructure) {
      return;
    }
    callOpenAPI(
      ungroupGroups({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          groupIds: [sectionId],
        },
      } as Parameters<typeof ungroupGroups>[0]),
    );
  }
  return (
    <MenuItem onClick={onClick} disabled={!canEditStructure}>
      Ungroup
    </MenuItem>
  );
}
