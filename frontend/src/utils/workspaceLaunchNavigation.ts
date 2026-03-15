import { C_ADDRESSES } from "utils/c_addresses";
import { HOME_ROUTER_PATH } from "utils/constants";

const OPEN_WORKSPACE_SWITCHER_QUERY_PARAM = "__setta_open_workspace_switcher";

export type WorkspaceLaunchBackNavigation =
  | { kind: "navigate"; target: string }
  | { kind: "assign"; target: string };

export function resolveWorkspaceLaunchReturnUrl(
  rawReturnUrl: string | null | undefined,
  baseHref: string,
): string {
  const fallback = new URL(HOME_ROUTER_PATH, baseHref).toString();
  if (!rawReturnUrl) {
    return fallback;
  }
  try {
    const parsed = new URL(rawReturnUrl, baseHref);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function buildWorkspaceSwitcherTarget(url: URL): string {
  url.searchParams.set(OPEN_WORKSPACE_SWITCHER_QUERY_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function buildWorkspaceSwitcherFallbackTarget(): string {
  return `${HOME_ROUTER_PATH}?${OPEN_WORKSPACE_SWITCHER_QUERY_PARAM}=1`;
}

export function resolveWorkspaceLaunchBackNavigation(
  returnUrl: string,
  currentHref: string,
): WorkspaceLaunchBackNavigation {
  try {
    const currentUrl = new URL(currentHref);
    const resolvedReturnUrl = new URL(returnUrl, currentHref);
    const allowedOrigins = new Set<string>([
      currentUrl.origin,
      C_ADDRESSES.BACKEND_ORIGIN,
      C_ADDRESSES.LAUNCHER_ORIGIN,
    ]);
    if (!allowedOrigins.has(resolvedReturnUrl.origin)) {
      throw new Error("Disallowed return URL origin.");
    }
    const isBackendOrLauncherHomeReturn =
      resolvedReturnUrl.pathname === HOME_ROUTER_PATH &&
      (resolvedReturnUrl.origin === C_ADDRESSES.BACKEND_ORIGIN ||
        resolvedReturnUrl.origin === C_ADDRESSES.LAUNCHER_ORIGIN);
    if (
      resolvedReturnUrl.origin === currentUrl.origin ||
      isBackendOrLauncherHomeReturn
    ) {
      return {
        kind: "navigate",
        target: buildWorkspaceSwitcherTarget(resolvedReturnUrl),
      };
    }
    resolvedReturnUrl.searchParams.set(OPEN_WORKSPACE_SWITCHER_QUERY_PARAM, "1");
    return { kind: "assign", target: resolvedReturnUrl.toString() };
  } catch {
    return {
      kind: "navigate",
      target: buildWorkspaceSwitcherFallbackTarget(),
    };
  }
}
