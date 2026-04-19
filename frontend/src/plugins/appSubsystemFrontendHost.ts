import {
  createAppSubsystemFrontendHost,
  type AppSubsystemDeploymentSession,
  type AppSubsystemFrontendHost,
  type AppSubsystemNotification,
  type AppSubsystemProjectContext,
  type AppSubsystemRuntimeContext,
  type AppSubsystemServerModeState,
} from "@setta/app-subsystem-frontend-sdk";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useLocalStorage,
  useProjectLoading,
  useProjectState,
  useServerMode,
  useSettings,
  useShareSession,
} from "state/definitions";
import { NotificationTypeEnum } from "utils/generatedTypes";

function buildAppSubsystemProjectContext(): AppSubsystemProjectContext {
  const projectMetadataState = useAllProjectMetadata.getState();
  const projectConfig = useProjectState.getState().projectConfig;

  return {
    defaultProjectConfigId: projectMetadataState.defaultProjectConfigId,
    projectMetadata: projectMetadataState.projectMetadata.map((entry) => ({
      id: entry.id,
      name: entry.name,
    })),
    projectConfig: {
      id: projectConfig.id === NULL_PROJECT_CONFIG_ID ? null : projectConfig.id,
      name: projectConfig.name,
      entryCodeBlockId: projectConfig.entryCodeBlockId ?? null,
    },
  };
}

function sameAppSubsystemProjectContext(
  left: AppSubsystemProjectContext,
  right: AppSubsystemProjectContext,
): boolean {
  if (left.defaultProjectConfigId !== right.defaultProjectConfigId) {
    return false;
  }
  if (
    left.projectConfig.id !== right.projectConfig.id ||
    left.projectConfig.name !== right.projectConfig.name ||
    left.projectConfig.entryCodeBlockId !== right.projectConfig.entryCodeBlockId
  ) {
    return false;
  }
  if (left.projectMetadata.length !== right.projectMetadata.length) {
    return false;
  }
  return left.projectMetadata.every((entry, index) => {
    const other = right.projectMetadata[index];
    return entry.id === other?.id && entry.name === other?.name;
  });
}

function buildAppSubsystemRuntimeContext(): AppSubsystemRuntimeContext {
  const shareSession = useShareSession.getState();
  const localStorageState = useLocalStorage.getState();
  const settingsState = useSettings.getState();
  const isAppDeploymentMode =
    shareSession.isDeploymentMode && shareSession.deploymentMode === "app";

  return {
    isAppDeploymentMode,
    shareSessionId: isAppDeploymentMode ? shareSession.shareSessionId : null,
    sessionRunCount: isAppDeploymentMode ? shareSession.sessionRunCount : 0,
    sharePolicy: isAppDeploymentMode ? shareSession.sharePolicy : null,
    defaultRunSnapshotMode: settingsState.backend.runSnapshotMode,
    runSnapshotModeByProjectConfigId: {
      ...localStorageState.runSnapshotModeByProjectConfigId,
    },
  };
}

function buildAppSubsystemDeploymentSession(): AppSubsystemDeploymentSession | null {
  const shareSession = useShareSession.getState();
  const projectMetadataState = useAllProjectMetadata.getState();
  if (!shareSession.isDeploymentMode || shareSession.deploymentMode !== "app") {
    return null;
  }
  if (
    !shareSession.shareSessionId ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion ||
    !projectMetadataState.defaultProjectConfigId
  ) {
    return null;
  }
  return {
    deploymentName: shareSession.shareDeploymentName,
    deploymentVersion: shareSession.shareDeploymentVersion,
    shareSessionId: shareSession.shareSessionId,
    sessionRunCount: shareSession.sessionRunCount,
    defaultProjectConfigId: projectMetadataState.defaultProjectConfigId,
    projectMetadata: projectMetadataState.projectMetadata,
    appPolicy: shareSession.sharePolicy,
    manifest: null,
  };
}

function setAppSubsystemDeploymentSession(
  session: AppSubsystemDeploymentSession | null,
): void {
  if (session === null) {
    useShareSession.getState().reset?.();
    useAllProjectMetadata.getState().reset?.();
    return;
  }
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: session.shareSessionId,
    sessionRunCount: session.sessionRunCount,
    sharePolicy: session.appPolicy,
    shareDeploymentName: session.deploymentName,
    shareDeploymentVersion: session.deploymentVersion,
    deploymentMode: "app",
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata ?? [],
  });
}

function incrementAppSubsystemDeploymentSessionRunCount(): void {
  const session = buildAppSubsystemDeploymentSession();
  if (session === null) {
    return;
  }
  useShareSession.setState({
    sessionRunCount: session.sessionRunCount + 1,
  });
}

function buildAppSubsystemServerModeState(): AppSubsystemServerModeState {
  const serverMode = useServerMode.getState();
  return {
    mode: serverMode.mode,
    modeResolved: serverMode.modeResolved,
    modeError: serverMode.modeError,
  };
}

function sameRunSnapshotModeOverrides(
  left: AppSubsystemRuntimeContext["runSnapshotModeByProjectConfigId"],
  right: AppSubsystemRuntimeContext["runSnapshotModeByProjectConfigId"],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

function sameAppSubsystemRuntimeContext(
  left: AppSubsystemRuntimeContext,
  right: AppSubsystemRuntimeContext,
): boolean {
  return (
    left.isAppDeploymentMode === right.isAppDeploymentMode &&
    left.shareSessionId === right.shareSessionId &&
    left.sessionRunCount === right.sessionRunCount &&
    left.sharePolicy === right.sharePolicy &&
    left.defaultRunSnapshotMode === right.defaultRunSnapshotMode &&
    sameRunSnapshotModeOverrides(
      left.runSnapshotModeByProjectConfigId,
      right.runSnapshotModeByProjectConfigId,
    )
  );
}

const appSubsystemProjectContextListeners = new Set<
  (projectContext: AppSubsystemProjectContext) => void
>();
const appSubsystemRuntimeContextListeners = new Set<
  (runtimeContext: AppSubsystemRuntimeContext) => void
>();

let currentAppSubsystemProjectContext = buildAppSubsystemProjectContext();
let currentAppSubsystemRuntimeContext = buildAppSubsystemRuntimeContext();

function syncAppSubsystemProjectContext(): void {
  const nextProjectContext = buildAppSubsystemProjectContext();
  if (
    sameAppSubsystemProjectContext(
      currentAppSubsystemProjectContext,
      nextProjectContext,
    )
  ) {
    return;
  }
  currentAppSubsystemProjectContext = nextProjectContext;
  for (const listener of appSubsystemProjectContextListeners) {
    listener(nextProjectContext);
  }
}

function syncAppSubsystemRuntimeContext(): void {
  const nextRuntimeContext = buildAppSubsystemRuntimeContext();
  if (
    sameAppSubsystemRuntimeContext(
      currentAppSubsystemRuntimeContext,
      nextRuntimeContext,
    )
  ) {
    return;
  }
  currentAppSubsystemRuntimeContext = nextRuntimeContext;
  for (const listener of appSubsystemRuntimeContextListeners) {
    listener(nextRuntimeContext);
  }
}

useProjectState.subscribe(syncAppSubsystemProjectContext);
useAllProjectMetadata.subscribe(syncAppSubsystemProjectContext);
useShareSession.subscribe(syncAppSubsystemRuntimeContext);
useLocalStorage.subscribe(syncAppSubsystemRuntimeContext);
useSettings.subscribe(syncAppSubsystemRuntimeContext);

function addAppSubsystemNotification(
  notification: AppSubsystemNotification,
): void {
  addTemporaryNotification(
    notification.message,
    notification.type ?? NotificationTypeEnum.info,
  );
}

export function createRuntimeAppSubsystemFrontendHost(
  overrides: Partial<AppSubsystemFrontendHost> = {},
): AppSubsystemFrontendHost {
  return createAppSubsystemFrontendHost({
    closeModal,
    notify: addAppSubsystemNotification,
    getProjectContext: () => currentAppSubsystemProjectContext,
    subscribeProjectContext: (
      listener: (projectContext: AppSubsystemProjectContext) => void,
    ) => {
      appSubsystemProjectContextListeners.add(listener);
      return () => {
        appSubsystemProjectContextListeners.delete(listener);
      };
    },
    getRuntimeContext: () => currentAppSubsystemRuntimeContext,
    subscribeRuntimeContext: (
      listener: (runtimeContext: AppSubsystemRuntimeContext) => void,
    ) => {
      appSubsystemRuntimeContextListeners.add(listener);
      return () => {
        appSubsystemRuntimeContextListeners.delete(listener);
      };
    },
    getAppDeploymentSession: buildAppSubsystemDeploymentSession,
    setAppDeploymentSession: setAppSubsystemDeploymentSession,
    incrementAppDeploymentSessionRunCount:
      incrementAppSubsystemDeploymentSessionRunCount,
    getServerModeState: buildAppSubsystemServerModeState,
    setServerModeState: (serverMode) => {
      useServerMode.setState(serverMode);
    },
    setProjectLoadState: (loadState) => {
      useProjectLoading.setState(loadState);
    },
    ...overrides,
  });
}

export const DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST =
  createRuntimeAppSubsystemFrontendHost();
