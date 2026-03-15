import { useAppConfigs, useAppDefinition } from "state/stores/appStores";
import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "state/stores/sessionStores";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";

const APP_SESSION_STORAGE_KEY = "settaAppSession";

export function clearAppSessionCookie() {
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

function isAppSessionResponse(
  value: unknown,
): value is AppDeploymentSessionResponse {
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

export function readAppSessionFromStorage(): AppDeploymentSessionResponse | null {
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

export function storeAppSession(session: AppDeploymentSessionResponse): void {
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

export function setAppSessionFromResponse(
  session: AppDeploymentSessionResponse,
) {
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
    projectMetadata: session.projectMetadata,
  });
}

export function hydrateAppSessionFromStorage(): AppDeploymentSessionResponse | null {
  const stored = readAppSessionFromStorage();
  if (!stored) {
    return null;
  }
  setAppSessionFromResponse(stored);
  return stored;
}

export function getCachedAppSession(): AppDeploymentSessionResponse | null {
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
