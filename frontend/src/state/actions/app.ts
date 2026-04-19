import {
  getAppDeploymentCurrentSession,
  getAppDeploymentProjectConfig,
  getAppDeploymentState,
  type GetAppDeploymentCurrentSessionResponses,
  type GetAppDeploymentStateResponses,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useAppConfigs } from "plugins/appSubsystemProjectState";
import {
  useAllProjectMetadata,
  useAppDefinition,
  useProjectLoading,
  useServerMode,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  getErrorCode,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import type { SingleConfig } from "utils/generatedTypes";

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
    projectState: response.projectState as SingleConfig,
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
export function resetAppSessionState() {
  clearAppSessionCookie();
  clearAppSessionStorage();
  useShareSession.getState().reset?.();
  useAllProjectMetadata.getState().reset?.();
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
function hydrateAppSessionFromStorage(): AppDeploymentSession | null {
  const stored = readAppSessionFromStorage();
  if (!stored) {
    return null;
  }
  setAppSessionFromResponse(stored);
  return stored;
}
function getCachedAppSession(): AppDeploymentSession | null {
  const shareSession = useShareSession.getState();
  const metadata = useAllProjectMetadata.getState();
  if (!shareSession.isDeploymentMode || shareSession.deploymentMode !== "app") {
    return null;
  }
  if (
    !shareSession.shareSessionId ||
    !shareSession.sharePolicy ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return null;
  }
  if (!metadata.defaultProjectConfigId) {
    return null;
  }
  return {
    deploymentName: shareSession.shareDeploymentName,
    deploymentVersion: shareSession.shareDeploymentVersion,
    shareSessionId: shareSession.shareSessionId,
    sessionRunCount: shareSession.sessionRunCount,
    defaultProjectConfigId: metadata.defaultProjectConfigId,
    projectMetadata: metadata.projectMetadata,
    appPolicy: shareSession.sharePolicy,
    manifest: null,
  };
}
function setAppSessionFromResponse(session: AppDeploymentSession) {
  clearAppSessionCookie();
  storeAppSession(session);
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: session.shareSessionId,
    sessionRunCount: session.sessionRunCount,
    sharePolicy: session.appPolicy,
    shareDeploymentName: session.deploymentName,
    shareDeploymentVersion: session.deploymentVersion,
    deploymentMode: "app",
  });
  useServerMode.setState({
    mode: "app",
    modeResolved: true,
    modeError: null,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata ?? [],
  });
}
/** @lintignore Consumed by the app subsystem plugin frontend. */
export function incrementAppSessionRunCount(): void {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode || shareSession.deploymentMode !== "app") {
    return;
  }
  const nextCount = shareSession.sessionRunCount + 1;
  useShareSession.setState({ sessionRunCount: nextCount });
  const stored = readAppSessionFromStorage();
  if (stored) {
    storeAppSession({ ...stored, sessionRunCount: nextCount });
  }
}
export async function ensureAppSessionFromCurrentDeployment(
  options: AppSessionOptions = {},
): Promise<AppDeploymentSession | null> {
  const forceNewSession = options.forceNewSession ?? false;
  if (forceNewSession) {
    resetAppSessionState();
  } else {
    clearAppSessionCookie();
    hydrateAppSessionFromStorage();
  }
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode === "app") {
    if (!forceNewSession) {
      const cached = getCachedAppSession();
      if (cached) {
        return cached;
      }
    }
  }
  const sessionRes = (await callOpenAPI(
    getAppDeploymentCurrentSession(),
  )) as AppDeploymentSessionRouteResponse;
  if (!res200(sessionRes)) {
    return null;
  }
  const session = normalizeAppSessionResponse(sessionRes.data);
  setAppSessionFromResponse(session);
  return session;
}
export async function initializeAppSessionFromCurrentDeployment(
  options: AppSessionOptions = {},
): Promise<boolean> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode !== "app") {
    resetAppSessionState();
    return false;
  }
  const session = await ensureAppSessionFromCurrentDeployment(options);
  if (session) {
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    return true;
  }
  if (!serverMode.modeResolved) {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  }
  resetAppSessionState();
  return false;
}
function getActiveAppDeploymentPath(): AppDeploymentPath | null {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode || shareSession.deploymentMode !== "app") {
    return null;
  }
  if (
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return null;
  }
  return {
    deploymentName: shareSession.shareDeploymentName,
    version: shareSession.shareDeploymentVersion,
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
  projectConfigId?: string,
): Promise<boolean> {
  const session = await ensureAppSessionFromCurrentDeployment({
    forceNewSession: true,
  });
  if (!session) {
    return false;
  }
  return await loadAppDeploymentState({
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
export async function loadAppDeploymentState({
  projectConfigId,
  allowRetry = true,
}: {
  projectConfigId?: string;
  allowRetry?: boolean;
} = {}): Promise<boolean> {
  const path = getActiveAppDeploymentPath();
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
  return await retryLoadAppDeploymentState(projectConfigId);
}
/** @lintignore Consumed by the app subsystem plugin frontend. */
export async function resetAppDeployment(): Promise<boolean> {
  useProjectLoading.setState({
    projectIsLoading: true,
    projectIs404: false,
  });
  resetProjectStores();
  const session = await ensureAppSessionFromCurrentDeployment({
    forceNewSession: true,
  });
  if (!session) {
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: true,
    });
    return false;
  }
  const loaded = await loadAppDeploymentState();
  useProjectLoading.setState({
    projectIsLoading: false,
    projectIs404: !loaded,
  });
  return loaded;
}
export async function ensureAppProjectConfigLoaded(
  projectConfigId: string,
): Promise<boolean> {
  if (useAppConfigs.getState().configs[projectConfigId]) {
    return true;
  }
  return await loadAppDeploymentState({ projectConfigId });
}
function storeAppConfigState(projectState: SingleConfig) {
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
