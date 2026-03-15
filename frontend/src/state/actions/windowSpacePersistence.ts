import { getAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import {
  flushPendingProjectChatWindowingWrites,
  syncProjectChatWindowingState,
} from "state/actions/projectChatWindowingWriteSync";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_create_window_space,
  route_delete_window_space,
  route_set_window_space_name,
  route_set_window_space_sort_order,
} from "utils/generatedEndpoints";
import {
  SettaNotificationTypeEnum,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { createRandomName } from "utils/idNameCreation";
import { sanitizeNameForSlug } from "utils/nameValidation";
import { addTemporaryNotification } from "./notifications";
import { snapshotFloatingWindowsForWindowSpace } from "./windowSpaceSnapshots";

export function sortWindowSpaces(
  windowSpaces: Array<WindowSpaceConfig>,
): Array<WindowSpaceConfig> {
  return [...windowSpaces].sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }
    const nameComparison = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getProjectWindowSpaces(
  projectConfig: Pick<ZustandProjectState["projectConfig"], "windowSpaces">,
): Record<string, WindowSpaceConfig> {
  return projectConfig.windowSpaces;
}

export function canMutateWindowSpaceLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

function cloneWindowSpaces(
  windowSpaces: Record<string, WindowSpaceConfig>,
): Record<string, WindowSpaceConfig> {
  return Object.fromEntries(
    Object.entries(windowSpaces).map(([windowSpaceId, windowSpace]) => [
      windowSpaceId,
      {
        ...windowSpace,
        windowsById: Object.fromEntries(
          Object.entries(windowSpace.windowsById).map(
            ([instanceId, window]) => [instanceId, { ...window }],
          ),
        ),
        order: [...windowSpace.order],
      },
    ]),
  );
}

function dispatchOptimisticWindowSpaceMutation({
  apply,
  projectConfigId,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  projectConfigId: string;
  send: (args: {
    frontendOpId: string;
    projectConfigId: string;
  }) => void | Promise<unknown>;
}) {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const previousWindowSpaces = cloneWindowSpaces(
    getProjectWindowSpaces(useProjectState.getState().projectConfig),
  );
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply,
    rollback: (state) => {
      state.projectConfig.windowSpaces =
        cloneWindowSpaces(previousWindowSpaces);
    },
    send: (frontendOpId) =>
      send({
        frontendOpId,
        projectConfigId,
      }),
  });
}

function resolveNextWindowSpaceName(
  windowSpaces: Record<string, WindowSpaceConfig>,
): string {
  const existingSlugs = new Set(
    Object.values(windowSpaces).map((windowSpace) =>
      sanitizeNameForSlug(windowSpace.name),
    ),
  );
  let nextName = createRandomName();
  while (existingSlugs.has(sanitizeNameForSlug(nextName))) {
    nextName = createRandomName();
  }
  return nextName;
}

export function applyWindowSpaceSortOrder(
  state: ZustandProjectState,
  orderedWindowSpaceIds: Array<string>,
): void {
  const windowSpaces = state.projectConfig.windowSpaces;
  if (orderedWindowSpaceIds.length !== Object.keys(windowSpaces).length) {
    throw new Error(
      "orderedWindowSpaceIds must include every window space exactly once.",
    );
  }

  const seen = new Set<string>();
  for (const windowSpaceId of orderedWindowSpaceIds) {
    if (!(windowSpaceId in windowSpaces)) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    if (seen.has(windowSpaceId)) {
      throw new Error("orderedWindowSpaceIds contains duplicates.");
    }
    seen.add(windowSpaceId);
  }

  orderedWindowSpaceIds.forEach((windowSpaceId, index) => {
    const windowSpace = windowSpaces[windowSpaceId];
    if (!windowSpace) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    windowSpace.sortIndex = index;
  });
}

function compactWindowSpaceSortIndices(
  windowSpaces: Record<string, WindowSpaceConfig>,
): void {
  const sortedWindowSpaces = sortWindowSpaces(Object.values(windowSpaces));
  for (let index = 0; index < sortedWindowSpaces.length; index += 1) {
    const sortedWindowSpace = sortedWindowSpaces[index];
    if (!sortedWindowSpace) {
      continue;
    }
    sortedWindowSpace.sortIndex = index;
  }
}

export function persistWindowSpaceSortOrder(
  projectConfigId: string,
  orderedWindowSpaceIds: Array<string>,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      applyWindowSpaceSortOrder(state, orderedWindowSpaceIds);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_sort_order({
        projectConfigId: nextProjectConfigId,
        orderedWindowSpaceIds,
        frontendOpId,
      }),
  });
}

export function setWindowSpaceName(
  projectConfigId: string,
  windowSpaceId: string,
  name: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      windowSpaces[windowSpaceId].name = name;
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_name({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        name,
        frontendOpId,
      }),
  });
}

export function deleteWindowSpace(
  projectConfigId: string,
  windowSpaceId: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      delete windowSpaces[windowSpaceId];
      compactWindowSpaceSortIndices(windowSpaces);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_delete_window_space({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        frontendOpId,
      }),
  });
}

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
