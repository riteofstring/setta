import { HOME_ROUTER_PATH } from "utils/constants";

const OPEN_WORKSPACE_SWITCHER_QUERY_PARAM = "__setta_open_workspace_switcher";

type WorkspaceLaunchBackNavigation =
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
