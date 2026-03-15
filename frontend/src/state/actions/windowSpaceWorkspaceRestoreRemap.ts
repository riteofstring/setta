import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingStateNormalization";
import {
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  allocateFreshProjectChatWindowInstanceId,
  dedupeRestoredSectionBindings,
} from "./windowSpaceSnapshotRestore";
import { buildWorkspaceRestoreFloatingReusePlan } from "./windowSpaceWorkspaceRestoreReuse";

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

export function prepareWorkspaceRestoredFloatingWindowing(
  restoredFloatingWindowing: ProjectChatWindowingState,
  currentWindowing: ProjectChatWindowingState,
): PreparedWorkspaceRestoredFloatingWindowing {
  const restoredFloatingWindowingWithoutNonFloatingSectionCollisions =
    dropRestoredSectionWindowsOwnedByNonFloatingWorkspaceHosts(
      restoredFloatingWindowing,
      currentWindowing,
    );
  const {
    preferredRestoredInstanceIdByOriginalId,
    supersededFloatingInstanceIds,
  } = buildWorkspaceRestoreFloatingReusePlan(
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
