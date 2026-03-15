import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import {
  flushPendingProjectChatWindowingWrites,
  syncProjectChatWindowingState,
} from "state/actions/projectChatWindowingWriteSync";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import { useProjectState } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_create_window_space } from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";

import { addTemporaryNotification } from "./notifications";
import {
  canMutateWindowSpaceLayout,
  getProjectWindowSpaces,
  resolveNextWindowSpaceName,
} from "./windowSpaceQueries";
import { snapshotFloatingWindowsForWindowSpace } from "./windowSpaceSnapshotCapture";

export async function createWindowSpaceFromCurrentFloatingWindows(): Promise<
  string | null
> {
  if (!canMutateWindowSpaceLayout()) {
    return null;
  }
  await flushPendingProjectChatWindowingWrites();
  const state = useProjectState.getState();
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId) {
    return null;
  }
  const snapshot = snapshotFloatingWindowsForWindowSpace(state);
  if (Object.keys(snapshot.windowsById).length === 0) {
    return null;
  }
  const projectConfigSnapshot = state.projectConfig;
  const sectionSnapshot = state.sections;
  const sectionImplSnapshot = state.sectionImpls;
  const sectionVariantSnapshot = state.sectionVariants;
  const syncResponse = await syncProjectChatWindowingState();
  if (!syncResponse || !res200(syncResponse)) {
    const detail = syncResponse ? getErrorDetail(syncResponse.data) : null;
    const statusSuffix =
      syncResponse && typeof syncResponse.status === "number"
        ? ` (${syncResponse.status})`
        : "";
    const detailSuffix = detail ? `: ${detail}` : ".";
    console.error("Failed to sync project chat windowing before saving.", {
      status: syncResponse?.status ?? null,
      detail,
      projectConfigId,
    });
    addTemporaryNotification(
      `Failed to sync window layout before saving${statusSuffix}${detailSuffix}`,
      SettaNotificationTypeEnum.error,
    );
    return null;
  }
  await flushPendingProjectChatWindowingWrites();
  const latestState = useProjectState.getState();
  const syncedWindowing =
    latestState.projectConfig.id === projectConfigId
      ? getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        latestState.projectChatWindowing
      : getAuthoritativeProjectChatWindowingState(projectConfigId) ??
        syncResponse.data;
  const authoritativeSnapshot = snapshotFloatingWindowsForWindowSpace({
    projectChatWindowing: syncedWindowing,
    projectConfig: projectConfigSnapshot,
    sections: sectionSnapshot,
    sectionImpls: sectionImplSnapshot,
    sectionVariants: sectionVariantSnapshot,
  });
  if (Object.keys(authoritativeSnapshot.windowsById).length === 0) {
    return null;
  }
  const nextWindowSpaceName = resolveNextWindowSpaceName(
    getProjectWindowSpaces(projectConfigSnapshot),
  );
  const response = await route_create_window_space({
    projectConfigId,
    state: authoritativeSnapshot,
    name: nextWindowSpaceName,
  });
  if (!res200(response)) {
    const detail = getErrorDetail(response.data);
    const statusSuffix =
      typeof response.status === "number" ? ` (${response.status})` : "";
    const detailSuffix = detail ? `: ${detail}` : ".";
    console.error("Failed to save window space.", {
      status: response.status,
      detail,
      name: nextWindowSpaceName,
      projectConfigId,
    });
    addTemporaryNotification(
      `Failed to save window space${statusSuffix}${detailSuffix}`,
      SettaNotificationTypeEnum.error,
    );
    return null;
  }
  useProjectState.setState((currentState) => {
    if (currentState.projectConfig.id !== projectConfigId) {
      return;
    }
    const windowSpaces = currentState.projectConfig.windowSpaces;
    if (windowSpaces[response.data.id]) {
      return;
    }
    windowSpaces[response.data.id] = response.data;
  });
  return response.data.id;
}
