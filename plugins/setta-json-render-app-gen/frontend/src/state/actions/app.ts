import {
  type AppSubsystemFrontendHost,
  callOpenAPI,
  getAppDeploymentCurrentSession,
  getAppDeploymentProjectConfig,
  getAppDeploymentState,
  type GetAppDeploymentCurrentSessionResponses,
  type GetAppDeploymentStateResponses,
} from "@setta/app-subsystem-frontend-sdk";
import {
  type AppProjectStateSnapshot,
  useAppConfigs,
} from "../../appSubsystemProjectState";
import { useAppDefinition } from "../../appSubsystemDefinitionState";
import {
  getErrorCode,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";

type AppDeploymentSession = GetAppDeploymentCurrentSessionResponses[200];
type AppDeploymentState = GetAppDeploymentStateResponses[200];

const APP_SESSION_STORAGE_KEY = "settaAppSession";

type AppSessionOptions = {
  forceNewSession?: boolean;
};

type AppDeploymentSessionRouteResponse =
  ResponseDataAndStatus<AppDeploymentSession>;
type AppDeploymentStateRouteResponse =
  ResponseDataAndStatus<AppDeploymentState>;
type AppDeploymentPath = {
  deploymentName: string;
  version: string;
};

function normalizeAppSessionResponse(
  session: AppDeploymentSession,
): AppDeploymentSession {
  return {
    ...session,
    manifest: session.manifest ?? null,
    projectMetadata: session.projectMetadata ?? [],
  };
}

function normalizeAppDeploymentStateResponse(
  response: AppDeploymentState,
): AppDeploymentState {
  return {
    ...response,
    appDefinition: response.appDefinition ?? null,
    appSpec: response.appSpec ?? null,
    projectState: response.projectState as AppProjectStateSnapshot,
  };
}

function clearAppSessionCookie() {
  document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
}

function clearAppSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
}

export function resetAppSessionState(
  frontendHost: AppSubsystemFrontendHost,
): void {
  clearAppSessionCookie();
  clearAppSessionStorage();
  frontendHost.setAppDeploymentSession(null);
  useAppDefinition.getState().reset?.();
  useAppConfigs.getState().reset?.();
}

function isAppSessionResponse(value: unknown): value is AppDeploymentSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.deploymentName !== "string") {
    return false;
  }
  if (typeof record.deploymentVersion !== "string") {
    return false;
  }
  if (typeof record.shareSessionId !== "string") {
    return false;
  }
  if (typeof record.sessionRunCount !== "number") {
    return false;
  }
  if (typeof record.defaultProjectConfigId !== "string") {
    return false;
  }
  if (!Array.isArray(record.projectMetadata)) {
    return false;
  }
  return true;
}

function readAppSessionFromStorage(): AppDeploymentSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isAppSessionResponse(parsed)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to read app session from storage:", error);
    return null;
  }
}

function storeAppSession(session: AppDeploymentSession): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      APP_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch (error) {
    console.warn("Failed to persist app session:", error);
  }
}

function setAppSessionFromResponse(
  frontendHost: AppSubsystemFrontendHost,
  session: AppDeploymentSession,
): void {
  clearAppSessionCookie();
  storeAppSession(session);
  frontendHost.setAppDeploymentSession(session);
  frontendHost.setServerModeState({
    mode: "app",
    modeResolved: true,
    modeError: null,
  });
}

function hydrateAppSessionFromStorage(
  frontendHost: AppSubsystemFrontendHost,
): AppDeploymentSession | null {
  const stored = readAppSessionFromStorage();
  if (!stored) {
    return null;
  }
  setAppSessionFromResponse(frontendHost, stored);
  return stored;
}

function getCachedAppSession(
  frontendHost: AppSubsystemFrontendHost,
): AppDeploymentSession | null {
  return frontendHost.getAppDeploymentSession();
}

/** @lintignore Consumed by the app subsystem plugin frontend. */
export function incrementAppSessionRunCount(
  frontendHost: AppSubsystemFrontendHost,
): void {
  const appDeploymentSession = frontendHost.getAppDeploymentSession();
  if (appDeploymentSession === null) {
    return;
  }
  const nextCount = appDeploymentSession.sessionRunCount + 1;
  frontendHost.incrementAppDeploymentSessionRunCount();
  const stored = readAppSessionFromStorage();
  if (stored) {
    storeAppSession({ ...stored, sessionRunCount: nextCount });
  }
}

export async function ensureAppSessionFromCurrentDeployment(
  frontendHost: AppSubsystemFrontendHost,
  options: AppSessionOptions = {},
): Promise<AppDeploymentSession | null> {
  const forceNewSession = options.forceNewSession ?? false;
  if (forceNewSession) {
    resetAppSessionState(frontendHost);
  } else {
    clearAppSessionCookie();
    hydrateAppSessionFromStorage(frontendHost);
  }
  const serverMode = frontendHost.getServerModeState();
  if (
    serverMode.modeResolved &&
    serverMode.mode === "app" &&
    !forceNewSession
  ) {
    const cached = getCachedAppSession(frontendHost);
    if (cached) {
      return cached;
    }
  }
  const sessionRes = (await callOpenAPI(
    getAppDeploymentCurrentSession(),
  )) as AppDeploymentSessionRouteResponse;
  if (!res200(sessionRes)) {
    return null;
  }
  const session = normalizeAppSessionResponse(sessionRes.data);
  setAppSessionFromResponse(frontendHost, session);
  return session;
}

export async function initializeAppSessionFromCurrentDeployment(
  frontendHost: AppSubsystemFrontendHost,
  options: AppSessionOptions = {},
): Promise<boolean> {
  const serverMode = frontendHost.getServerModeState();
  if (serverMode.modeResolved && serverMode.mode !== "app") {
    resetAppSessionState(frontendHost);
    return false;
  }
  const session = await ensureAppSessionFromCurrentDeployment(
    frontendHost,
    options,
  );
  if (session) {
    frontendHost.setServerModeState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    return true;
  }
  if (!serverMode.modeResolved) {
    frontendHost.setServerModeState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  }
  resetAppSessionState(frontendHost);
  return false;
}

function getActiveAppDeploymentPath(
  frontendHost: AppSubsystemFrontendHost,
): AppDeploymentPath | null {
  const appDeploymentSession = frontendHost.getAppDeploymentSession();
  if (appDeploymentSession === null) {
    return null;
  }
  return {
    deploymentName: appDeploymentSession.deploymentName,
    version: appDeploymentSession.deploymentVersion,
  };
}

async function requestAppDeploymentState(
  path: AppDeploymentPath,
  projectConfigId?: string,
): Promise<AppDeploymentStateRouteResponse> {
  if (!projectConfigId) {
    return (await callOpenAPI(
      getAppDeploymentState({
        path,
      } as Parameters<typeof getAppDeploymentState>[0]),
    )) as AppDeploymentStateRouteResponse;
  }
  return (await callOpenAPI(
    getAppDeploymentProjectConfig({
      path,
      body: {
        projectConfigId,
      },
    } as Parameters<typeof getAppDeploymentProjectConfig>[0]),
  )) as AppDeploymentStateRouteResponse;
}

function shouldRetryAppDeploymentState(
  response: AppDeploymentStateRouteResponse,
  allowRetry: boolean,
): boolean {
  if (!allowRetry || res200(response)) {
    return false;
  }
  const errorCode = getErrorCode(response.data);
  return (
    errorCode === "missing_share_session" ||
    errorCode === "unknown_share_session"
  );
}

async function retryLoadAppDeploymentState(
  frontendHost: AppSubsystemFrontendHost,
  projectConfigId?: string,
): Promise<boolean> {
  const session = await ensureAppSessionFromCurrentDeployment(frontendHost, {
    forceNewSession: true,
  });
  if (!session) {
    return false;
  }
  return await loadAppDeploymentState({
    frontendHost,
    projectConfigId,
    allowRetry: false,
  });
}

function applyAppDeploymentStateResponse(response: AppDeploymentState): void {
  const normalizedResponse = normalizeAppDeploymentStateResponse(response);
  if (normalizedResponse.appDefinition || normalizedResponse.appSpec) {
    useAppDefinition.setState({
      appDefinition: normalizedResponse.appDefinition ?? null,
      appSpec: normalizedResponse.appSpec ?? null,
    });
  }
  storeAppConfigState(normalizedResponse.projectState);
}

export async function loadAppDeploymentState(args: {
  frontendHost: AppSubsystemFrontendHost;
  projectConfigId?: string;
  allowRetry?: boolean;
}): Promise<boolean> {
  const { frontendHost, projectConfigId, allowRetry = true } = args;
  const path = getActiveAppDeploymentPath(frontendHost);
  if (!path) {
    return false;
  }
  const response = await requestAppDeploymentState(path, projectConfigId);
  if (res200(response)) {
    applyAppDeploymentStateResponse(response.data);
    return true;
  }
  if (!shouldRetryAppDeploymentState(response, allowRetry)) {
    return false;
  }
  return await retryLoadAppDeploymentState(frontendHost, projectConfigId);
}

/** @lintignore Consumed by the app subsystem plugin frontend. */
export async function resetAppDeployment(
  frontendHost: AppSubsystemFrontendHost,
): Promise<boolean> {
  frontendHost.setProjectLoadState({
    projectIsLoading: true,
    projectIs404: false,
  });
  frontendHost.resetProjectRuntimeState();
  const session = await ensureAppSessionFromCurrentDeployment(frontendHost, {
    forceNewSession: true,
  });
  if (!session) {
    frontendHost.setProjectLoadState({
      projectIsLoading: false,
      projectIs404: true,
    });
    return false;
  }
  const loaded = await loadAppDeploymentState({ frontendHost });
  frontendHost.setProjectLoadState({
    projectIsLoading: false,
    projectIs404: !loaded,
  });
  return loaded;
}

export async function ensureAppProjectConfigLoaded(
  frontendHost: AppSubsystemFrontendHost,
  projectConfigId: string,
): Promise<boolean> {
  if (useAppConfigs.getState().configs[projectConfigId]) {
    return true;
  }
  return await loadAppDeploymentState({ frontendHost, projectConfigId });
}

function storeAppConfigState(projectState: AppProjectStateSnapshot) {
  useAppConfigs.setState((state) => ({
    configs: {
      ...state.configs,
      [projectState.projectConfig.id]: {
        ...projectState,
        previewSectionVariantMap: {},
      },
    },
  }));
}
