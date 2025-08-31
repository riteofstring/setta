import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_prepare_sections_for_copy } from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { addTemporaryNotification } from "../notifications";
import { getCurrProjectConfigId } from "../sectionInfos";

export async function copy() {
  const activeSectionIds = useProjectState.getState().projectConfig.activeIds;
  if (activeSectionIds.length > 0 && window.getSelection()?.toString() === "") {
    addTemporaryNotification("Copying...");
    const res = await route_prepare_sections_for_copy({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: activeSectionIds,
    });
    if (res200(res)) {
      await navigator.clipboard.writeText(JSON.stringify(res.data));
      addTemporaryNotification("Copied to clipboard");
    } else {
      addTemporaryNotification(
        "Copying failed!",
        SettaNotificationTypeEnum.error,
      );
    }
  }
}

function getRelativePositions(sections) {
  const positions = {};
  for (const k of Object.keys(sections)) {
    const rect = getSectionRect(k);
    if (rect) {
      positions[k] = { x: rect.x, y: rect.y, zIndex: 0 };
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const p of Object.values(positions)) {
    if (p.x < minX) {
      minX = p.x;
    }
    if (p.y < minY) {
      minY = p.y;
    }
  }

  return _.mapValues(positions, (v) => ({
    x: v.x - minX,
    y: v.y - minY,
    zIndex: v.zIndex,
  }));
}
