import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingStateNormalization";
import type { ZustandProjectState } from "state/definitions";
import {
  createProjectChatWindowingState,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { createProjectChatWindowingStateFromWindowSpace } from "./windowSpaceSnapshotRestore";
import { prepareWorkspaceRestoredFloatingWindowing } from "./windowSpaceWorkspaceRestoreRemap";

export type WorkspaceRestoreSourceState = Pick<
  ZustandProjectState,
  "projectChatWindowing" | "projectConfig" | "sections"
>;

export type WorkspaceRestoreWindowingPlan = {
  nextWindowing: ProjectChatWindowingState;
  restoredWindowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
};

function mergeProjectChatWindowSpaceOrder(
  preservedOrder: Array<string>,
  restoredOrder: Array<string>,
  mergedInstancesById: ProjectChatWindowingState["instancesById"],
): Array<string> {
  const nextOrder: Array<string> = [];
  const seen = new Set<string>();
  const appendIfPresent = (instanceId: string) => {
    if (!mergedInstancesById[instanceId] || seen.has(instanceId)) {
      return;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  };
  for (const instanceId of preservedOrder) {
    appendIfPresent(instanceId);
  }
  for (const instanceId of restoredOrder) {
    appendIfPresent(instanceId);
  }
  for (const instanceId of Object.keys(mergedInstancesById)) {
    appendIfPresent(instanceId);
  }
  return nextOrder;
}

export function buildWorkspaceRestoreWindowingPlan(
  windowSpace: WindowSpaceConfig,
  state: WorkspaceRestoreSourceState,
): WorkspaceRestoreWindowingPlan {
  const currentWindowing = state.projectChatWindowing;
  const restoredFloatingWindowing =
    createProjectChatWindowingStateFromWindowSpace(windowSpace, state);
  const {
    restoredWindowing,
    remappedInstanceIdByOriginalId,
    supersededFloatingInstanceIds,
  } = prepareWorkspaceRestoredFloatingWindowing(
    restoredFloatingWindowing,
    currentWindowing,
  );
  const preservedInstancesById: ProjectChatWindowingState["instancesById"] = {};
  const preservedOrder: Array<string> = [];

  for (const instanceId of currentWindowing.order) {
    const instance = currentWindowing.instancesById[instanceId];
    if (
      !instance ||
      supersededFloatingInstanceIds.has(instanceId) ||
      restoredWindowing.instancesById[instanceId]
    ) {
      continue;
    }
    preservedInstancesById[instanceId] = instance;
    preservedOrder.push(instanceId);
  }

  for (const [instanceId, instance] of Object.entries(
    currentWindowing.instancesById,
  )) {
    if (
      supersededFloatingInstanceIds.has(instanceId) ||
      restoredWindowing.instancesById[instanceId] ||
      preservedInstancesById[instanceId]
    ) {
      continue;
    }
    preservedInstancesById[instanceId] = instance;
  }

  const instancesById = {
    ...preservedInstancesById,
    ...restoredWindowing.instancesById,
  };

  return {
    nextWindowing: normalizeProjectChatWindowingState(
      createProjectChatWindowingState({
        instancesById,
        order: mergeProjectChatWindowSpaceOrder(
          preservedOrder,
          restoredWindowing.order,
          instancesById,
        ),
        nextInstanceNumber: Math.max(
          currentWindowing.nextInstanceNumber,
          restoredWindowing.nextInstanceNumber,
        ),
      }),
    ),
    restoredWindowing,
    remappedInstanceIdByOriginalId,
  };
}
