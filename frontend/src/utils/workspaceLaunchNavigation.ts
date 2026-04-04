import { HOME_ROUTER_PATH } from "utils/constants";
import { GENERATED_BOOTSTRAP_PROTOCOL } from "utils/generatedTypes";

const OPEN_WORKSPACE_SWITCHER_QUERY_PARAM =
  GENERATED_BOOTSTRAP_PROTOCOL.openWorkspaceSwitcherQueryParam;

type WorkspaceLaunchBackNavigation =
  | { kind: "navigate"; target: string }
  | { kind: "assign"; target: string };

type WorkspaceLaunchReturnUrlTrust = "same-origin-only" | "backend-validated";

export function resolveWorkspaceLaunchReturnUrl(
  rawReturnUrl: string | null | undefined,
  baseHref: string,
  trust: WorkspaceLaunchReturnUrlTrust = "same-origin-only",
): string {
  const baseUrl = new URL(baseHref);
  const fallback = new URL(HOME_ROUTER_PATH, baseUrl).toString();
  if (!rawReturnUrl) {
    return fallback;
  }
  try {
    const parsed = new URL(rawReturnUrl, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    if (trust === "same-origin-only" && parsed.origin !== baseUrl.origin) {
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
  trust: WorkspaceLaunchReturnUrlTrust = "same-origin-only",
): WorkspaceLaunchBackNavigation {
  try {
    const currentUrl = new URL(currentHref);
    const resolvedReturnUrl = new URL(returnUrl, currentHref);
    if (
      resolvedReturnUrl.protocol !== "http:" &&
      resolvedReturnUrl.protocol !== "https:"
    ) {
      throw new Error("Return URL must use http or https.");
    }
    if (resolvedReturnUrl.origin === currentUrl.origin) {
      return {
        kind: "navigate",
        target: buildWorkspaceSwitcherTarget(resolvedReturnUrl),
      };
    }
    if (trust !== "backend-validated") {
      throw new Error("Cross-origin return URL requires backend validation.");
    }
    resolvedReturnUrl.searchParams.set(
      OPEN_WORKSPACE_SWITCHER_QUERY_PARAM,
      "1",
    );
    return { kind: "assign", target: resolvedReturnUrl.toString() };
  } catch {
    return {
      kind: "navigate",
      target: buildWorkspaceSwitcherFallbackTarget(),
    };
  }
}
