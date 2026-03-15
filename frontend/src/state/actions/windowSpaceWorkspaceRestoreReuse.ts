import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { buildOrderedProjectChatWindowInstanceIds } from "./windowSpaceSnapshotRestore";

export type WorkspaceRestoreFloatingReusePlan = {
  preferredRestoredInstanceIdByOriginalId: Record<string, string>;
  supersededFloatingInstanceIds: Set<string>;
};

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

export function buildWorkspaceRestoreFloatingReusePlan(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): WorkspaceRestoreFloatingReusePlan {
  return {
    preferredRestoredInstanceIdByOriginalId:
      buildPreferredRestoredInstanceIdByOriginalId(
        restoredFloatingWindowing,
        currentWindowing,
      ),
    supersededFloatingInstanceIds:
      resolveWorkspaceFloatingWindowsSupersededByRestore(
        restoredFloatingWindowing,
        currentWindowing,
      ),
  };
}
