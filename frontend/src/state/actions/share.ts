import {
  getShareDeploymentCurrentSession,
  getShareDeploymentProjectConfig,
  type GetShareDeploymentCurrentSessionResponses,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
import type { SingleConfig } from "utils/generatedTypes";

type ShareDeploymentSession = GetShareDeploymentCurrentSessionResponses[200];
type ShareProjectConfigLoadSession = {
  deploymentName: string;
  deploymentVersion: string;
  allowLLM: boolean;
};

const SHARE_SESSION_STORAGE_KEY = "settaShareSession";
type ShareSessionOptions = {
  forceNewSession?: boolean;
};
type ShareDeploymentSessionRouteResponse =
  ResponseDataAndStatus<ShareDeploymentSession>;
type ShareProjectConfigRouteResponse = ResponseDataAndStatus<{
  projectState: SingleConfig;
}>;
function normalizeShareSessionResponse(
  session: ShareDeploymentSession,
): ShareDeploymentSession {
  return {
    ...session,
    manifest: session.manifest ?? null,
    projectMetadata: session.projectMetadata ?? [],
  };
}
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
): value is ShareDeploymentSession {
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
function readShareSessionFromStorage(): ShareDeploymentSession | null {
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
function storeShareSession(session: ShareDeploymentSession): void {
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
function hydrateShareSessionFromStorage(): ShareDeploymentSession | null {
  const stored = readShareSessionFromStorage();
  if (!stored) {
    return null;
  }
  setShareSessionFromResponse(stored);
  return stored;
}
function getCachedShareSession(): ShareDeploymentSession | null {
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
function setShareSessionFromResponse(session: ShareDeploymentSession) {
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
    projectMetadata: session.projectMetadata ?? [],
  });
}
export async function ensureShareSessionFromCurrentDeployment(
  options: ShareSessionOptions = {},
): Promise<ShareDeploymentSession | null> {
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
  const sessionRes = (await callOpenAPI(
    getShareDeploymentCurrentSession(),
  )) as ShareDeploymentSessionRouteResponse;
  if (!res200(sessionRes)) {
    return null;
  }
  const session = normalizeShareSessionResponse(sessionRes.data);
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
function getShareProjectConfigLoadSession(): ShareProjectConfigLoadSession | null {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode) {
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
    deploymentVersion: shareSession.shareDeploymentVersion,
    allowLLM: Boolean(shareSession.sharePolicy?.allowLLM),
  };
}
function buildShareProjectConfigRequest(
  projectConfigId: string,
  shareSession: ShareProjectConfigLoadSession,
): Parameters<typeof getShareDeploymentProjectConfig>[0] {
  return {
    path: {
      deploymentName: shareSession.deploymentName,
      version: shareSession.deploymentVersion,
    },
    body: {
      projectConfigId,
    },
  };
}
function shouldRetryShareProjectConfigLoad(
  errorCode: string | null | undefined,
  allowRetry: boolean,
): boolean {
  return (
    allowRetry &&
    (errorCode === "missing_share_session" ||
      errorCode === "unknown_share_session")
  );
}
async function retryShareProjectConfigLoad(
  projectConfigId: string,
  errorCode: string | null | undefined,
  allowRetry: boolean,
): Promise<boolean | null> {
  if (!shouldRetryShareProjectConfigLoad(errorCode, allowRetry)) {
    return null;
  }
  const session = await ensureShareSessionFromCurrentDeployment({
    forceNewSession: true,
  });
  if (!session) {
    return null;
  }
  return loadShareProjectConfig({
    projectConfigId,
    allowRetry: false,
  });
}
async function finalizeShareProjectConfigLoad(
  projectState: SingleConfig,
  projectConfigId: string,
  allowLLM: boolean,
): Promise<boolean> {
  await loadProjectState(projectState);
  if (allowLLM) {
    await requestAIFollowSnapshot(projectConfigId);
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: false });
  return true;
}
export async function loadShareProjectConfig({
  projectConfigId,
  allowRetry = true,
}: ShareProjectConfigLoadParams): Promise<boolean> {
  const shareSession = getShareProjectConfigLoadSession();
  if (!shareSession) {
    return false;
  }
  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });
  const stateRes = (await callOpenAPI(
    getShareDeploymentProjectConfig(
      buildShareProjectConfigRequest(projectConfigId, shareSession),
    ),
  )) as ShareProjectConfigRouteResponse;
  if (res200(stateRes)) {
    return finalizeShareProjectConfigLoad(
      stateRes.data.projectState,
      projectConfigId,
      shareSession.allowLLM,
    );
  }
  const retryResult = await retryShareProjectConfigLoad(
    projectConfigId,
    getErrorCode(stateRes.data),
    allowRetry,
  );
  if (retryResult !== null) {
    return retryResult;
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
  return false;
}
