import {
  createAppSubsystemFrontendHost,
  createSettingsState,
  createSingleConfig,
  type AppSubsystemDeploymentSession,
  type AppSubsystemFrontendHost,
  type AppSubsystemProjectContext,
  type AppSubsystemProjectStateSnapshot,
  type AppSubsystemRuntimeContext,
  type AppSubsystemServerModeState,
} from "@setta/app-subsystem-frontend-sdk";

import { useAppDefinition } from "../../src/appSubsystemDefinitionState";
import {
  useAppConfigs,
  useAppPreview,
} from "../../src/appSubsystemProjectState";
import { clearAllAppSpecPatchStreams } from "../../src/appSubsystemPreviewController";

type ResettableStore = {
  getState: () => { reset?: () => void };
};

export function resetAppSubsystemPluginStores(): void {
  for (const store of [useAppDefinition, useAppConfigs, useAppPreview]) {
    (store as ResettableStore).getState().reset?.();
  }
  clearAllAppSpecPatchStreams();
}

export function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

export function createStatefulAppSubsystemFrontendHost(args: {
  appDeploymentSession?: AppSubsystemDeploymentSession | null;
  projectContext?: AppSubsystemProjectContext;
  projectStateSnapshot?: AppSubsystemProjectStateSnapshot;
  runtimeContext?: AppSubsystemRuntimeContext;
  serverModeState?: AppSubsystemServerModeState;
} = {}): AppSubsystemFrontendHost {
  let appDeploymentSession = args.appDeploymentSession ?? null;
  let serverModeState =
    args.serverModeState ??
    ({
      mode: null,
      modeResolved: false,
      modeError: null,
    } satisfies AppSubsystemServerModeState);
  let runtimeContext =
    args.runtimeContext ??
    ({
      isAppDeploymentMode: appDeploymentSession !== null,
      shareSessionId: appDeploymentSession?.shareSessionId ?? null,
      sessionRunCount: appDeploymentSession?.sessionRunCount ?? 0,
      sharePolicy: appDeploymentSession?.appPolicy ?? null,
      defaultRunSnapshotMode: createSettingsState().backend.runSnapshotMode,
      runSnapshotModeByProjectConfigId: {},
    } satisfies AppSubsystemRuntimeContext);
  const projectContext =
    args.projectContext ??
    ({
      defaultProjectConfigId: null,
      projectMetadata: [],
      projectConfig: {
        id: null,
        name: "",
        entryCodeBlockId: null,
      },
    } satisfies AppSubsystemProjectContext);
  const projectStateSnapshot =
    args.projectStateSnapshot ??
    ({
      ...createSingleConfig(),
      previewSectionVariantMap: {},
    } as AppSubsystemProjectStateSnapshot);

  return createAppSubsystemFrontendHost({
    getProjectContext: () => projectContext,
    subscribeProjectContext: () => () => undefined,
    getProjectStateSnapshot: () => projectStateSnapshot,
    subscribeProjectStateSnapshot: () => () => undefined,
    getRuntimeContext: () => runtimeContext,
    subscribeRuntimeContext: () => () => undefined,
    getAppDeploymentSession: () => appDeploymentSession,
    setAppDeploymentSession: (session) => {
      appDeploymentSession = session;
      runtimeContext = {
        ...runtimeContext,
        isAppDeploymentMode: session !== null,
        shareSessionId: session?.shareSessionId ?? null,
        sessionRunCount: session?.sessionRunCount ?? 0,
        sharePolicy: session?.appPolicy ?? null,
      };
    },
    incrementAppDeploymentSessionRunCount: () => {
      if (!appDeploymentSession) {
        return;
      }
      appDeploymentSession = {
        ...appDeploymentSession,
        sessionRunCount: appDeploymentSession.sessionRunCount + 1,
      };
      runtimeContext = {
        ...runtimeContext,
        sessionRunCount: appDeploymentSession.sessionRunCount,
      };
    },
    getServerModeState: () => serverModeState,
    subscribeServerModeState: () => () => undefined,
    setServerModeState: (next) => {
      serverModeState = next;
    },
    setProjectLoadState: () => undefined,
    resetProjectRuntimeState: () => undefined,
  });
}
