import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { getActiveSectionsBounds } from "forks/xyflow/core/utils/graph";
import { pasteSections, prepareSectionsForCopy } from "openapi/http";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useMisc, useShareSession } from "state/definitions";
import {
  ClipboardDataTypeEnum,
  NotificationTypeEnum,
  type SectionsClipboardData,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";
type PrepareSectionsForCopyRouteResponse =
  ResponseDataAndStatus<SectionsClipboardData>;
type PasteSectionsRouteResponse = ResponseDataAndStatus<null>;
export async function copy() {
  const activeSectionIds = getActiveSectionUIIds();
  if (activeSectionIds.length > 0 && window.getSelection()?.toString() === "") {
    addTemporaryNotification("Copying...");
    const res = (await callOpenAPI(
      prepareSectionsForCopy({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: activeSectionIds,
        },
      } as Parameters<typeof prepareSectionsForCopy>[0]),
    )) as PrepareSectionsForCopyRouteResponse;
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
  let x: SectionsClipboardData;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  switch (x.type) {
    case ClipboardDataTypeEnum.Sections: {
      const response = (await callOpenAPI(
        pasteSections({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            data: x.data,
            position: getPasteLocation(),
            asRef,
          },
        } as Parameters<typeof pasteSections>[0]),
      )) as PasteSectionsRouteResponse;
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
