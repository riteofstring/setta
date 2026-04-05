import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import {
  useAllProjectMetadata,
  useProjectLoading,
  useServerMode,
  useShareSession,
} from "state/definitions";
import {
  getErrorCode,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  route_share_deployment_current_session,
  route_share_deployment_project_config,
} from "utils/generatedEndpoints";
import type {
  ProjectStateSingleConfigWithCompletedOpIDs,
  ShareDeploymentSessionResponse,
} from "utils/generatedTypes";

const SHARE_SESSION_STORAGE_KEY = "settaShareSession";
type ShareSessionOptions = {
  forceNewSession?: boolean;
};

type ShareDeploymentSessionRouteResponse =
  ResponseDataAndStatus<ShareDeploymentSessionResponse>;
type ShareProjectConfigRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIDs>;

function clearShareSessionCookie() {
  document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
}

function clearShareSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(SHARE_SESSION_STORAGE_KEY);
}

export function resetShareSessionState() {
  clearShareSessionCookie();
  clearShareSessionStorage();
  useShareSession.getState().reset?.();
  useAllProjectMetadata.getState().reset?.();
}

function isShareSessionResponse(
  value: unknown,
): value is ShareDeploymentSessionResponse {
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

function readShareSessionFromStorage(): ShareDeploymentSessionResponse | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SHARE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isShareSessionResponse(parsed)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to read share session from storage:", error);
    return null;
  }
}

function storeShareSession(session: ShareDeploymentSessionResponse): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      SHARE_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch (error) {
    console.warn("Failed to persist share session:", error);
  }
}

function hydrateShareSessionFromStorage(): ShareDeploymentSessionResponse | null {
  const stored = readShareSessionFromStorage();
  if (!stored) {
    return null;
  }
  setShareSessionFromResponse(stored);
  return stored;
}

function getCachedShareSession(): ShareDeploymentSessionResponse | null {
  const shareSession = useShareSession.getState();
  const metadata = useAllProjectMetadata.getState();
  if (!shareSession.isDeploymentMode) {
    return null;
  }
  if (shareSession.deploymentMode !== "share") {
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
    sharePolicy: shareSession.sharePolicy,
    manifest: null,
  };
}

function setShareSessionFromResponse(session: ShareDeploymentSessionResponse) {
  clearShareSessionCookie();
  storeShareSession(session);
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: session.shareSessionId,
    sessionRunCount: session.sessionRunCount,
    sharePolicy: session.sharePolicy,
    shareDeploymentName: session.deploymentName,
    shareDeploymentVersion: session.deploymentVersion,
    deploymentMode: "share",
  });
  useServerMode.setState({
    mode: "share",
    modeResolved: true,
    modeError: null,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata,
  });
}

export async function ensureShareSessionFromCurrentDeployment(
  options: ShareSessionOptions = {},
): Promise<ShareDeploymentSessionResponse | null> {
  const forceNewSession = options.forceNewSession ?? false;
  if (forceNewSession) {
    resetShareSessionState();
  } else {
    clearShareSessionCookie();
    hydrateShareSessionFromStorage();
  }
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode === "share") {
    if (!forceNewSession) {
      const cached = getCachedShareSession();
      if (cached) {
        return cached;
      }
    }
  }
  const sessionRes: ShareDeploymentSessionRouteResponse =
    await route_share_deployment_current_session();
  if (!res200(sessionRes)) {
    return null;
  }
  const session = sessionRes.data;
  setShareSessionFromResponse(session);
  return session;
}

export async function initializeShareSessionFromCurrentDeployment(
  options: ShareSessionOptions = {},
): Promise<boolean> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved && serverMode.mode !== "share") {
    resetShareSessionState();
    return false;
  }
  const session = await ensureShareSessionFromCurrentDeployment(options);
  if (session) {
    useServerMode.setState({
      mode: "share",
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
  resetShareSessionState();
  return false;
}

type ShareProjectConfigLoadParams = {
  projectConfigId: string;
  allowRetry?: boolean;
};

export async function loadShareProjectConfig({
  projectConfigId,
  allowRetry = true,
}: ShareProjectConfigLoadParams): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (
    !shareSession.isDeploymentMode ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return false;
  }

  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });
  const stateRes: ShareProjectConfigRouteResponse =
    await route_share_deployment_project_config(
      shareSession.shareDeploymentName,
      shareSession.shareDeploymentVersion,
      { projectConfigId },
    );
  if (!res200(stateRes)) {
    const errorCode = getErrorCode(stateRes.data);
    if (
      allowRetry &&
      (errorCode === "missing_share_session" ||
        errorCode === "unknown_share_session")
    ) {
      const session = await ensureShareSessionFromCurrentDeployment({
        forceNewSession: true,
      });
      if (session) {
        return await loadShareProjectConfig({
          projectConfigId,
          allowRetry: false,
        });
      }
    }
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  await loadProjectState(stateRes.data.projectState);
  if (shareSession.sharePolicy?.allowLLM) {
    await requestAIFollowSnapshot(projectConfigId);
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: false });
  return true;
}
