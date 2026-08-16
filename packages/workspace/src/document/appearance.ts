import { reprojectNodeStylesForAppearance } from "./nodeProjection";
import {
  getNodeInternalsStore,
  getWorkspaceAppearanceStore,
  getWorkspaceDocumentStore,
  type WorkspaceColorMode,
} from "./stores";
import type { WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";

const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

type AppearanceRuntime = {
  removeHostCleanup: (() => void) | null;
  systemColorSchemeListener: ((event: MediaQueryListEvent) => void) | null;
  systemColorSchemeQuery: MediaQueryList | null;
};

const appearanceRuntimesByHost = new WeakMap<WorkspaceHost, AppearanceRuntime>();

function getAppearanceRuntime(host: WorkspaceHost): AppearanceRuntime {
  const existing = appearanceRuntimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const runtime: AppearanceRuntime = {
    removeHostCleanup: null,
    systemColorSchemeListener: null,
    systemColorSchemeQuery: null,
  };
  runtime.removeHostCleanup = registerWorkspaceHostCleanup(host, () => {
    stopSystemColorSchemeSync(host);
    appearanceRuntimesByHost.delete(host);
  });
  appearanceRuntimesByHost.set(host, runtime);
  return runtime;
}

function reprojectWorkspaceNodes(host: WorkspaceHost) {
  const documentState = getWorkspaceDocumentStore(host).getState();
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const nextNodes = reprojectNodeStylesForAppearance(
    host,
    documentState,
    currentNodes,
  );
  if (nextNodes !== currentNodes) {
    nodeStore.setState({ x: nextNodes });
  }
}

function publishAppearance(
  host: WorkspaceHost,
  colorMode: WorkspaceColorMode,
  darkMode: boolean,
) {
  const appearanceStore = getWorkspaceAppearanceStore(host);
  const previousDarkMode = appearanceStore.getState().darkMode;
  appearanceStore.setState({ colorMode, darkMode });
  if (darkMode !== previousDarkMode) {
    reprojectWorkspaceNodes(host);
  }
}

function stopSystemColorSchemeSync(host: WorkspaceHost) {
  const runtime = getAppearanceRuntime(host);
  if (runtime.systemColorSchemeQuery && runtime.systemColorSchemeListener) {
    runtime.systemColorSchemeQuery.removeEventListener(
      "change",
      runtime.systemColorSchemeListener,
    );
  }
  runtime.systemColorSchemeQuery = null;
  runtime.systemColorSchemeListener = null;
}

function getSystemColorSchemeQuery(): MediaQueryList {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    throw new Error(
      "System workspace color mode requires window.matchMedia; choose light or dark during server rendering.",
    );
  }
  const mediaQuery = window.matchMedia(SYSTEM_DARK_MODE_QUERY);
  if (
    typeof mediaQuery.addEventListener !== "function" ||
    typeof mediaQuery.removeEventListener !== "function"
  ) {
    throw new Error(
      "System workspace color mode requires MediaQueryList change-event support.",
    );
  }
  return mediaQuery;
}

function startSystemColorSchemeSync(
  host: WorkspaceHost,
  mediaQuery: MediaQueryList,
) {
  const runtime = getAppearanceRuntime(host);
  const listener = (event: MediaQueryListEvent) => {
    if (
      getWorkspaceAppearanceStore(host).getState().colorMode === "system" &&
      runtime.systemColorSchemeQuery === mediaQuery
    ) {
      publishAppearance(host, "system", event.matches);
    }
  };
  mediaQuery.addEventListener("change", listener);
  runtime.systemColorSchemeQuery = mediaQuery;
  runtime.systemColorSchemeListener = listener;
  publishAppearance(host, "system", mediaQuery.matches);
}

export function setWorkspaceColorMode(
  host: WorkspaceHost,
  colorMode: WorkspaceColorMode,
): void {
  if (colorMode !== "light" && colorMode !== "dark" && colorMode !== "system") {
    throw new Error(`Unknown workspace color mode: ${String(colorMode)}.`);
  }
  if (colorMode === "system") {
    // Resolve support before replacing a working mode/listener so a rejected system request is
    // atomic from the consumer's perspective.
    const mediaQuery = getSystemColorSchemeQuery();
    stopSystemColorSchemeSync(host);
    startSystemColorSchemeSync(host, mediaQuery);
    return;
  }
  stopSystemColorSchemeSync(host);
  publishAppearance(host, colorMode, colorMode === "dark");
}
