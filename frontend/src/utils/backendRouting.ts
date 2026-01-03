import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

const DEV_MODE = import.meta.env?.DEV;

function getShareBackendHost(): string {
  const host = import.meta.env?.VITE_SHARE_BACKEND_HOST;
  if (host) {
    return host;
  }
  return C.DEFAULT_HOST;
}

function getShareBackendPort(): string {
  const port = import.meta.env?.VITE_SHARE_BACKEND_PORT;
  if (port) {
    return port;
  }
  return String(C.DEFAULT_PORT);
}

function getIdeBackendHost(): string {
  return C.DEFAULT_HOST;
}

function getIdeBackendPort(): string {
  return String(C.DEFAULT_PORT);
}

export function shouldUseShareBackend(pathname?: string): boolean {
  const resolvedPath =
    pathname ??
    (typeof window === "undefined" ? undefined : window.location?.pathname);
  if (!resolvedPath) {
    return false;
  }
  return resolvedPath.startsWith("/share/");
}

export function getBackendOrigin(isShareBackend: boolean): string {
  if (DEV_MODE) {
    const host = isShareBackend ? getShareBackendHost() : getIdeBackendHost();
    const port = isShareBackend ? getShareBackendPort() : getIdeBackendPort();
    return `http://${host}:${port}`;
  }
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin;
}

export function getBackendBase(isShareBackend: boolean): string {
  return `${getBackendOrigin(isShareBackend)}${RouteEnum.PREFIX}`;
}

export function getWebsocketBase(isShareBackend: boolean): string {
  if (DEV_MODE) {
    const host = isShareBackend ? getShareBackendHost() : getIdeBackendHost();
    const port = isShareBackend ? getShareBackendPort() : getIdeBackendPort();
    return `ws://${host}:${port}${RouteEnum.PREFIX}`;
  }
  if (typeof window === "undefined") {
    return "";
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${RouteEnum.PREFIX}`;
}
