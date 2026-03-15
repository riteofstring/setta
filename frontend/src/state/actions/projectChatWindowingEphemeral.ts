import { useMisc } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

const PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR = "::";

export function buildProjectChatEphemeralWindowInstanceKey(
  projectConfigId: string,
  instanceId: string,
): string {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedInstanceId = instanceId.trim();
  if (!normalizedProjectConfigId) {
    throw new Error("Project config id is required for project chat ephemera.");
  }
  if (!normalizedInstanceId) {
    throw new Error("Instance id is required for project chat ephemera.");
  }
  return `${normalizedProjectConfigId}${PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR}${normalizedInstanceId}`;
}

function parseProjectChatEphemeralWindowInstanceKey(
  key: string | null | undefined,
): { projectConfigId: string; instanceId: string } | null {
  const normalizedKey = key?.trim() ?? "";
  if (!normalizedKey) {
    return null;
  }
  const separatorIndex = normalizedKey.indexOf(
    PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR,
  );
  if (separatorIndex === -1) {
    return null;
  }
  const projectConfigId = normalizedKey.slice(0, separatorIndex);
  const instanceId = normalizedKey.slice(
    separatorIndex + PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR.length,
  );
  if (!projectConfigId || !instanceId) {
    return null;
  }
  return { projectConfigId, instanceId };
}

function getTrackedGitPaneGraphWindowKeyFromMisc(): string | null {
  return (
    useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId ?? null
  );
}

export function setTrackedGitPaneGraphWindowInstanceId(
  projectConfigId: string,
  instanceId: string | null,
): void {
  useMisc.setState({
    projectChatTrackedGitPaneGraphWindowInstanceId:
      instanceId === null
        ? null
        : buildProjectChatEphemeralWindowInstanceKey(
            projectConfigId,
            instanceId,
          ),
  });
}

function clearTrackedGitPaneGraphWindowInstanceIdIfMatches(
  projectConfigId: string,
  instanceId: string,
): void {
  if (
    getTrackedGitPaneGraphWindowKeyFromMisc() !==
    buildProjectChatEphemeralWindowInstanceKey(projectConfigId, instanceId)
  ) {
    return;
  }
  setTrackedGitPaneGraphWindowInstanceId(projectConfigId, null);
}

export function clearTrackedGitPaneGraphWindowIfMatches(
  projectConfigId: string,
  instanceId: string,
): void {
  clearTrackedGitPaneGraphWindowInstanceIdIfMatches(
    projectConfigId,
    instanceId,
  );
}

function pruneProjectChatGitGraphEmbeddedPaneVisibility(
  projectConfigId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  useMisc.setState((state) => {
    const visibilityByEphemeralKey =
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId;
    const nextVisibilityByEphemeralKey: Record<string, true> = {};
    let changed = false;

    for (const ephemeralKey of Object.keys(visibilityByEphemeralKey)) {
      const parsedKey =
        parseProjectChatEphemeralWindowInstanceKey(ephemeralKey);
      if (!parsedKey) {
        changed = true;
        continue;
      }
      if (parsedKey.projectConfigId !== projectConfigId) {
        nextVisibilityByEphemeralKey[ephemeralKey] = true;
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
      nextVisibilityByEphemeralKey[ephemeralKey] = true;
    }

    if (
      !changed &&
      Object.keys(nextVisibilityByEphemeralKey).length ===
        Object.keys(visibilityByEphemeralKey).length
    ) {
      return state;
    }

    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId:
        nextVisibilityByEphemeralKey,
    };
  });
}

export function isProjectChatGitGraphEmbeddedPaneVisible(
  projectConfigId: string,
  instanceId: string,
): boolean {
  const ephemeralKey = buildProjectChatEphemeralWindowInstanceKey(
    projectConfigId,
    instanceId,
  );
  return (
    useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId[
      ephemeralKey
    ] === true
  );
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
  useMisc.setState((state) => {
    const currentVisibility =
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId;
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

    if (!changed) {
      return state;
    }

    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: nextVisibility,
    };
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
  useMisc.setState((state) => {
    const currentVisibility =
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId;
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

    if (!changed) {
      return state;
    }

    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: nextVisibility,
    };
  });
}

export function getTrackedGitPaneGraphWindowInstanceIdForProject(
  projectConfigId: string,
): string | null {
  const parsedKey = parseProjectChatEphemeralWindowInstanceKey(
    getTrackedGitPaneGraphWindowKeyFromMisc(),
  );
  if (!parsedKey || parsedKey.projectConfigId !== projectConfigId) {
    return null;
  }
  return parsedKey.instanceId;
}

export function resolveTrackedGitPaneGraphWindowInstanceId(
  state: ProjectChatWindowingState,
  projectConfigId: string,
): string | null {
  const trackedInstanceId =
    getTrackedGitPaneGraphWindowInstanceIdForProject(projectConfigId);
  if (!trackedInstanceId) {
    if (getTrackedGitPaneGraphWindowKeyFromMisc() !== null) {
      setTrackedGitPaneGraphWindowInstanceId(projectConfigId, null);
    }
    return null;
  }
  const instance = state.instancesById[trackedInstanceId];
  if (
    !instance ||
    instance.mode !== ChatWindowModeEnum.git_graph_mode ||
    instance.placement !== ChatWindowPlacementEnum.maximized ||
    instance.isClosed ||
    instance.isMinimized
  ) {
    setTrackedGitPaneGraphWindowInstanceId(projectConfigId, null);
    return null;
  }
  return trackedInstanceId;
}

export function reconcileProjectChatWindowingEphemeralState(
  nextProjectChatWindowing: ProjectChatWindowingState,
  projectConfigId: string,
): void {
  resolveTrackedGitPaneGraphWindowInstanceId(
    nextProjectChatWindowing,
    projectConfigId,
  );
  pruneProjectChatGitGraphEmbeddedPaneVisibility(
    projectConfigId,
    nextProjectChatWindowing,
  );
}
