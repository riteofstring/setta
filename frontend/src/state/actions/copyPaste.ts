import {
  getActiveSectionsBounds,
  getSectionRect,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useMisc, useProjectState, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_paste_sections,
  route_prepare_sections_for_copy,
} from "utils/generatedEndpoints";
import {
  BaseClipboardDataUnionWithDiscriminator,
  ClipboardDataTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

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

export async function paste({ asRef = false }) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  let x: BaseClipboardDataUnionWithDiscriminator;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  switch (x.type) {
    case ClipboardDataTypeEnum.Sections:
      return route_paste_sections({
        projectConfigId: getCurrProjectConfigId(),
        data: x.data,
        position: getPasteLocation(),
        asRef,
      });
    default:
      return x.type satisfies never;
  }
}

function getPasteLocation() {
  if (useProjectState.getState().projectConfig.activeIds.length === 0) {
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
