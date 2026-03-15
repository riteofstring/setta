import {
  type LayoutMiscState,
  useMisc,
} from "state/stores/layoutInteractionStores";
import {
  ChatWindowModeEnum,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  buildProjectChatEphemeralWindowInstanceKey,
  parseProjectChatEphemeralWindowInstanceKey,
} from "./projectChatWindowingEphemeralKeys";

type GitGraphEmbeddedPaneVisibilityState = Pick<
  LayoutMiscState,
  "projectChatGitGraphEmbeddedPaneVisibleByInstanceId"
>;

function setProjectChatGitGraphEmbeddedPaneVisibility(
  update: (
    currentVisibility: Record<string, true>,
  ) => Record<string, true> | null,
): void {
  useMisc.setState((state) => {
    const nextVisibility = update(
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    );
    if (nextVisibility === null) {
      return state;
    }
    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: nextVisibility,
    };
  });
}

export function isProjectChatGitGraphEmbeddedPaneVisibleInState(
  state: GitGraphEmbeddedPaneVisibilityState,
  projectConfigId: string,
  instanceId: string,
): boolean {
  const ephemeralKey = buildProjectChatEphemeralWindowInstanceKey(
    projectConfigId,
    instanceId,
  );
  return (
    state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId[ephemeralKey] ===
    true
  );
}

export function isProjectChatGitGraphEmbeddedPaneVisible(
  projectConfigId: string,
  instanceId: string,
): boolean {
  return isProjectChatGitGraphEmbeddedPaneVisibleInState(
    useMisc.getState(),
    projectConfigId,
    instanceId,
  );
}

export function toggleProjectChatGitGraphEmbeddedPaneVisibility(
  projectConfigId: string,
  instanceId: string,
): void {
  const ephemeralKey = buildProjectChatEphemeralWindowInstanceKey(
    projectConfigId,
    instanceId,
  );
  setProjectChatGitGraphEmbeddedPaneVisibility((currentVisibility) => {
    const nextVisibility = {
      ...currentVisibility,
    };
    if (nextVisibility[ephemeralKey] === true) {
      delete nextVisibility[ephemeralKey];
    } else {
      nextVisibility[ephemeralKey] = true;
    }
    return nextVisibility;
  });
}

export function getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject(
  projectConfigId: string,
): Array<string> {
  const visibleInstanceIds: Array<string> = [];
  for (const ephemeralKey of Object.keys(
    useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
  )) {
    const parsedKey = parseProjectChatEphemeralWindowInstanceKey(ephemeralKey);
    if (parsedKey?.projectConfigId !== projectConfigId) {
      continue;
    }
    visibleInstanceIds.push(parsedKey.instanceId);
  }
  return visibleInstanceIds;
}

export function clearProjectChatGitGraphEmbeddedPaneVisibilityForOtherProjects(
  projectConfigId: string,
): void {
  setProjectChatGitGraphEmbeddedPaneVisibility((currentVisibility) => {
    const nextVisibility: Record<string, true> = {};
    let changed = false;

    for (const ephemeralKey of Object.keys(currentVisibility)) {
      const parsedKey =
        parseProjectChatEphemeralWindowInstanceKey(ephemeralKey);
      if (!parsedKey) {
        changed = true;
        continue;
      }
      if (parsedKey.projectConfigId !== projectConfigId) {
        changed = true;
        continue;
      }
      nextVisibility[ephemeralKey] = true;
    }

    return changed ? nextVisibility : null;
  });
}

export function replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
  projectConfigId: string,
  visibleInstanceIds: Array<string>,
): void {
  const visibleKeys = new Set(
    visibleInstanceIds.map((instanceId) =>
      buildProjectChatEphemeralWindowInstanceKey(projectConfigId, instanceId),
    ),
  );
  setProjectChatGitGraphEmbeddedPaneVisibility((currentVisibility) => {
    const nextVisibility: Record<string, true> = {};
    let changed = false;

    for (const ephemeralKey of Object.keys(currentVisibility)) {
      const parsedKey =
        parseProjectChatEphemeralWindowInstanceKey(ephemeralKey);
      if (parsedKey?.projectConfigId === projectConfigId) {
        changed = true;
        continue;
      }
      nextVisibility[ephemeralKey] = true;
    }
    for (const ephemeralKey of visibleKeys) {
      if (currentVisibility[ephemeralKey] !== true) {
        changed = true;
      }
      nextVisibility[ephemeralKey] = true;
    }

    return changed ? nextVisibility : null;
  });
}

export function reconcileProjectChatGitGraphEmbeddedPaneVisibility(
  projectConfigId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  setProjectChatGitGraphEmbeddedPaneVisibility((currentVisibility) => {
    const nextVisibility: Record<string, true> = {};
    let changed = false;

    for (const ephemeralKey of Object.keys(currentVisibility)) {
      const parsedKey =
        parseProjectChatEphemeralWindowInstanceKey(ephemeralKey);
      if (!parsedKey) {
        changed = true;
        continue;
      }
      if (parsedKey.projectConfigId !== projectConfigId) {
        nextVisibility[ephemeralKey] = true;
        continue;
      }
      const instance =
        nextProjectChatWindowing.instancesById[parsedKey.instanceId];
      if (
        !instance ||
        instance.mode !== ChatWindowModeEnum.git_graph_mode ||
        instance.isClosed
      ) {
        changed = true;
        continue;
      }
      nextVisibility[ephemeralKey] = true;
    }

    if (
      !changed &&
      Object.keys(nextVisibility).length ===
        Object.keys(currentVisibility).length
    ) {
      return null;
    }
    return nextVisibility;
  });
}
