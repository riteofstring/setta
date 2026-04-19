import {
  createAppSubsystemFrontendHost,
  type AppSubsystemDeploymentSession,
  type AppSubsystemFrontendHost,
  type AppSubsystemNotification,
  type AppSubsystemProjectContext,
  type AppSubsystemProjectStateSnapshot,
  type AppSubsystemRealtimeDependencyEvent,
  type AppSubsystemRuntimeContext,
  type AppSubsystemServerModeState,
} from "@setta/app-subsystem-frontend-sdk";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/realtimeDependencySend";
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

function buildAppSubsystemProjectStateSnapshot(): AppSubsystemProjectStateSnapshot {
  const { previewSectionVariantMap, reset, ...projectState } =
    useProjectState.getState();
  void reset;
  return {
    ...projectState,
    previewSectionVariantMap: {
      ...previewSectionVariantMap,
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
const appSubsystemProjectStateSnapshotListeners = new Set<
  (projectState: AppSubsystemProjectStateSnapshot) => void
>();
const appSubsystemRuntimeContextListeners = new Set<
  (runtimeContext: AppSubsystemRuntimeContext) => void
>();
const appSubsystemServerModeStateListeners = new Set<
  (serverMode: AppSubsystemServerModeState) => void
>();

let currentAppSubsystemProjectContext = buildAppSubsystemProjectContext();
let currentAppSubsystemProjectStateSnapshot =
  buildAppSubsystemProjectStateSnapshot();
let currentAppSubsystemRuntimeContext = buildAppSubsystemRuntimeContext();
let currentAppSubsystemServerModeState = buildAppSubsystemServerModeState();

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

function syncAppSubsystemProjectStateSnapshot(): void {
  currentAppSubsystemProjectStateSnapshot =
    buildAppSubsystemProjectStateSnapshot();
  for (const listener of appSubsystemProjectStateSnapshotListeners) {
    listener(currentAppSubsystemProjectStateSnapshot);
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

function sameAppSubsystemServerModeState(
  left: AppSubsystemServerModeState,
  right: AppSubsystemServerModeState,
): boolean {
  return (
    left.mode === right.mode &&
    left.modeResolved === right.modeResolved &&
    left.modeError === right.modeError
  );
}

function syncAppSubsystemServerModeState(): void {
  const nextServerModeState = buildAppSubsystemServerModeState();
  if (
    sameAppSubsystemServerModeState(
      currentAppSubsystemServerModeState,
      nextServerModeState,
    )
  ) {
    return;
  }
  currentAppSubsystemServerModeState = nextServerModeState;
  for (const listener of appSubsystemServerModeStateListeners) {
    listener(nextServerModeState);
  }
}

useProjectState.subscribe(syncAppSubsystemProjectContext);
useProjectState.subscribe(syncAppSubsystemProjectStateSnapshot);
useAllProjectMetadata.subscribe(syncAppSubsystemProjectContext);
useShareSession.subscribe(syncAppSubsystemRuntimeContext);
useLocalStorage.subscribe(syncAppSubsystemRuntimeContext);
useSettings.subscribe(syncAppSubsystemRuntimeContext);
useServerMode.subscribe(syncAppSubsystemServerModeState);

function addAppSubsystemNotification(
  notification: AppSubsystemNotification,
): void {
  addTemporaryNotification(
    notification.message,
    notification.type ?? NotificationTypeEnum.info,
  );
}

function emitAppSubsystemRealtimeDependencyEvent(
  event: AppSubsystemRealtimeDependencyEvent,
  projectConfigIdOverride?: string | null,
): void {
  sendRealtimeDependencyEvent(event, projectConfigIdOverride);
}

export function createRuntimeAppSubsystemFrontendHost(
  overrides: Partial<AppSubsystemFrontendHost> = {},
): AppSubsystemFrontendHost {
  return createAppSubsystemFrontendHost({
    closeModal,
    notify: addAppSubsystemNotification,
    emitRealtimeDependencyEvent: emitAppSubsystemRealtimeDependencyEvent,
    emitRealtimeSectionParamLiteral: sendRealtimeSectionParamLiteral,
    getProjectContext: () => currentAppSubsystemProjectContext,
    subscribeProjectContext: (
      listener: (projectContext: AppSubsystemProjectContext) => void,
    ) => {
      appSubsystemProjectContextListeners.add(listener);
      return () => {
        appSubsystemProjectContextListeners.delete(listener);
      };
    },
    getProjectStateSnapshot: () => currentAppSubsystemProjectStateSnapshot,
    subscribeProjectStateSnapshot: (
      listener: (projectState: AppSubsystemProjectStateSnapshot) => void,
    ) => {
      appSubsystemProjectStateSnapshotListeners.add(listener);
      return () => {
        appSubsystemProjectStateSnapshotListeners.delete(listener);
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
    getServerModeState: () => currentAppSubsystemServerModeState,
    subscribeServerModeState: (
      listener: (serverMode: AppSubsystemServerModeState) => void,
    ) => {
      appSubsystemServerModeStateListeners.add(listener);
      return () => {
        appSubsystemServerModeStateListeners.delete(listener);
      };
    },
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
