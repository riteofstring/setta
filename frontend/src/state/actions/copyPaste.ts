import {
  getActiveSectionsBounds,
  getSectionRect,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useMisc, useShareSession } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_paste_sections,
  route_prepare_sections_for_copy,
} from "utils/generatedEndpoints";
import {
  BaseClipboardDataUnionWithDiscriminator,
  ClipboardDataTypeEnum,
  NotificationTypeEnum,
  SectionsClipboardDataResponse,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

type PrepareSectionsForCopyRouteResponse =
  ResponseDataAndStatus<SectionsClipboardDataResponse>;
type PasteSectionsRouteResponse = ResponseDataAndStatus<null>;

export async function copy() {
  const activeSectionIds = getActiveSectionUIIds();
  if (activeSectionIds.length > 0 && window.getSelection()?.toString() === "") {
    addTemporaryNotification("Copying...");
    const res: PrepareSectionsForCopyRouteResponse =
      await route_prepare_sections_for_copy({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: activeSectionIds,
      });
    if (res200(res)) {
      await navigator.clipboard.writeText(JSON.stringify(res.data));
      addTemporaryNotification("Copied to clipboard");
    } else {
      addTemporaryNotification("Copying failed!", NotificationTypeEnum.error);
    }
  }
}

export async function paste({ asRef = false }) {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  let x: BaseClipboardDataUnionWithDiscriminator;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  switch (x.type) {
    case ClipboardDataTypeEnum.Sections: {
      const response: PasteSectionsRouteResponse = await route_paste_sections({
        projectConfigId: getCurrProjectConfigId(),
        data: x.data,
        position: getPasteLocation(),
        asRef,
      });
      return response;
    }
    default:
      return x.type satisfies never;
  }
}

function getPasteLocation() {
  if (getActiveSectionUIIds().length === 0) {
    return useMisc.getState().lastPaneClickLocation;
  }
  // paste directly to the right of the active sections
  const { x, y, width } = getActiveSectionsBounds();
  return { x: x + width, y };
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
