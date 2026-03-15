import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingSelectors";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  allocateFreshProjectChatWindowInstanceId,
  buildOrderedProjectChatWindowInstanceIds,
  dedupeRestoredSectionBindings,
} from "./windowSpaceSnapshots";

export type PreparedWorkspaceRestoredFloatingWindowing = {
  restoredWindowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
  supersededFloatingInstanceIds: Set<string>;
};

function remapRestoredWindowSpaceInstanceIdsForWorkspace(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
  supersededFloatingInstanceIds: Set<string>,
  preferredInstanceIdByOriginalId: Record<string, string>,
): {
  windowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
} {
  const usedInstanceIds = new Set(
    Object.keys(currentWindowing.instancesById).filter(
      (instanceId) => !supersededFloatingInstanceIds.has(instanceId),
    ),
  );
  const processedRestoredInstanceIds = new Set<string>();
  const remappedInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const remappedOrder: Array<string> = [];
  const remappedInstanceIdByOriginalId: Record<string, string> = {};
  let nextInstanceNumber = Math.max(
    currentWindowing.nextInstanceNumber,
    restoredFloatingWindowing.nextInstanceNumber,
  );

  for (const instanceId of restoredFloatingWindowing.order) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    processedRestoredInstanceIds.add(instanceId);
    let nextInstanceId =
      preferredInstanceIdByOriginalId[instanceId] ?? instanceId;
    if (usedInstanceIds.has(nextInstanceId)) {
      const allocated = allocateFreshProjectChatWindowInstanceId(
        usedInstanceIds,
        nextInstanceNumber,
      );
      nextInstanceId = allocated.instanceId;
      nextInstanceNumber = allocated.nextInstanceNumber;
    } else {
      usedInstanceIds.add(nextInstanceId);
    }
    remappedInstanceIdByOriginalId[instanceId] = nextInstanceId;
    remappedInstancesById[nextInstanceId] =
      nextInstanceId === instanceId
        ? instance
        : {
            ...instance,
            instanceId: nextInstanceId,
          };
    remappedOrder.push(nextInstanceId);
  }

  for (const [instanceId, instance] of Object.entries(
    restoredFloatingWindowing.instancesById,
  )) {
    if (processedRestoredInstanceIds.has(instanceId)) {
      continue;
    }
    if (usedInstanceIds.has(instanceId)) {
      const allocated = allocateFreshProjectChatWindowInstanceId(
        usedInstanceIds,
        nextInstanceNumber,
      );
      remappedInstanceIdByOriginalId[instanceId] = allocated.instanceId;
      remappedInstancesById[allocated.instanceId] = {
        ...instance,
        instanceId: allocated.instanceId,
      };
      remappedOrder.push(allocated.instanceId);
      nextInstanceNumber = allocated.nextInstanceNumber;
      continue;
    }
    usedInstanceIds.add(instanceId);
    remappedInstanceIdByOriginalId[instanceId] = instanceId;
    remappedInstancesById[instanceId] = instance;
    remappedOrder.push(instanceId);
  }

  return {
    windowing: normalizeProjectChatWindowingState(
      createProjectChatWindowingState({
        ...restoredFloatingWindowing,
        instancesById: remappedInstancesById,
        order: remappedOrder,
        nextInstanceNumber,
      }),
    ),
    remappedInstanceIdByOriginalId,
  };
}

function dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const authoritativeSectionIds = new Set(
    Object.values(currentWindowing.instancesById)
      .map((instance) => {
        if (
          instance.placement === ChatWindowPlacementEnum.floating ||
          instance.sectionIdOrNull === null
        ) {
          return null;
        }
        return instance.sectionIdOrNull;
      })
      .filter((sectionId): sectionId is string => sectionId !== null),
  );
  if (authoritativeSectionIds.size === 0) {
    return restoredFloatingWindowing;
  }

  const nextInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const nextOrder: string[] = [];
  for (const instanceId of restoredFloatingWindowing.order) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (
      !instance ||
      (instance.sectionIdOrNull !== null &&
        authoritativeSectionIds.has(instance.sectionIdOrNull))
    ) {
      continue;
    }
    nextInstancesById[instanceId] = instance;
    nextOrder.push(instanceId);
  }
  for (const [instanceId, instance] of Object.entries(
    restoredFloatingWindowing.instancesById,
  )) {
    if (
      instanceId in nextInstancesById ||
      (instance.sectionIdOrNull !== null &&
        authoritativeSectionIds.has(instance.sectionIdOrNull))
    ) {
      continue;
    }
    nextInstancesById[instanceId] = instance;
  }
  return normalizeProjectChatWindowingState(
    createProjectChatWindowingState({
      ...restoredFloatingWindowing,
      instancesById: nextInstancesById,
      order: nextOrder,
    }),
  );
}

function resolveFloatingWindowRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.sectionIdOrNull !== null) {
    return `section:${instance.sectionIdOrNull}`;
  }
  if (instance.mode === ChatWindowModeEnum.git_graph_mode) {
    return "git-graph";
  }
  if (
    instance.mode === ChatWindowModeEnum.project_ai_mode &&
    instance.chatId !== null
  ) {
    return `project-chat:${instance.chatId}`;
  }
  return null;
}

function resolveBoundWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.mode !== ChatWindowModeEnum.project_ai_mode) {
    return null;
  }
  if (instance.sectionIdOrNull !== null) {
    return `section:${instance.sectionIdOrNull}`;
  }
  if (instance.chatId !== null) {
    return `project-chat:${instance.chatId}`;
  }
  return null;
}

function resolveReusableWorkspaceRestoreOwnerKey(
  instance: ProjectChatWindowInstance,
): string | null {
  if (instance.placement !== ChatWindowPlacementEnum.floating) {
    return null;
  }
  return resolveBoundWorkspaceRestoreOwnerKey(instance);
}

function buildPreferredRestoredInstanceIdByOriginalId(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): Record<string, string> {
  const reusableInstanceIdByOwnerKey = new Map<string, string>();
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    currentWindowing,
  )) {
    const instance = currentWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    const ownerKey = resolveReusableWorkspaceRestoreOwnerKey(instance);
    if (ownerKey === null || reusableInstanceIdByOwnerKey.has(ownerKey)) {
      continue;
    }
    reusableInstanceIdByOwnerKey.set(ownerKey, instanceId);
  }

  if (reusableInstanceIdByOwnerKey.size === 0) {
    return {};
  }

  const preferredInstanceIdByOriginalId: Record<string, string> = {};
  const claimedLiveInstanceIds = new Set<string>();
  for (const instanceId of buildOrderedProjectChatWindowInstanceIds(
    restoredFloatingWindowing,
  )) {
    const instance = restoredFloatingWindowing.instancesById[instanceId];
    if (!instance) {
      continue;
    }
    const ownerKey = resolveBoundWorkspaceRestoreOwnerKey(instance);
    if (ownerKey === null) {
      continue;
    }
    const preferredInstanceId = reusableInstanceIdByOwnerKey.get(ownerKey);
    if (
      preferredInstanceId === undefined ||
      claimedLiveInstanceIds.has(preferredInstanceId)
    ) {
      continue;
    }
    preferredInstanceIdByOriginalId[instanceId] = preferredInstanceId;
    claimedLiveInstanceIds.add(preferredInstanceId);
  }

  return preferredInstanceIdByOriginalId;
}

function resolveWorkspaceFloatingWindowsSupersededByRestore(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): Set<string> {
  const restoredOwnerKeys = new Set(
    Object.values(restoredFloatingWindowing.instancesById)
      .map((instance) => resolveFloatingWindowRestoreOwnerKey(instance))
      .filter((ownerKey): ownerKey is string => ownerKey !== null),
  );
  const supersededFloatingInstanceIds = new Set<string>();

  for (const [instanceId, instance] of Object.entries(
    currentWindowing.instancesById,
  )) {
    if (instance.placement !== ChatWindowPlacementEnum.floating) {
      continue;
    }
    const ownerKey = resolveFloatingWindowRestoreOwnerKey(instance);
    if (ownerKey !== null && restoredOwnerKeys.has(ownerKey)) {
      supersededFloatingInstanceIds.add(instanceId);
    }
  }

  return supersededFloatingInstanceIds;
}

export function prepareWorkspaceRestoredFloatingWindowing(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): PreparedWorkspaceRestoredFloatingWindowing {
  const restoredFloatingWindowingWithoutNonFloatingSectionCollisions =
    dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
      restoredFloatingWindowing,
      currentWindowing,
    );
  const preferredRestoredInstanceIdByOriginalId =
    buildPreferredRestoredInstanceIdByOriginalId(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
    );
  const supersededFloatingInstanceIds =
    resolveWorkspaceFloatingWindowsSupersededByRestore(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
    );
  const remappedRestoredFloatingWindowingResult =
    remapRestoredWindowSpaceInstanceIdsForWorkspace(
      restoredFloatingWindowingWithoutNonFloatingSectionCollisions,
      currentWindowing,
      supersededFloatingInstanceIds,
      preferredRestoredInstanceIdByOriginalId,
    );

  return {
    restoredWindowing: dedupeRestoredSectionBindings(
      remappedRestoredFloatingWindowingResult.windowing,
    ),
    remappedInstanceIdByOriginalId:
      remappedRestoredFloatingWindowingResult.remappedInstanceIdByOriginalId,
    supersededFloatingInstanceIds,
  };
}
