import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
  type WorkspaceColorMode,
} from "./stores";

const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

let systemColorSchemeQuery: MediaQueryList | null = null;
let systemColorSchemeListener: ((event: MediaQueryListEvent) => void) | null = null;

function reprojectWorkspaceNodes() {
  const documentState = useWorkspaceDocument.getState();
  const currentNodes = useNodeInternals.getState().x;
  useNodeInternals.setState({
    x: createNodesMapFromDocumentChildren(documentState, currentNodes),
  });
}

function publishAppearance(colorMode: WorkspaceColorMode, darkMode: boolean) {
  const previousDarkMode = useWorkspaceAppearance.getState().darkMode;
  useWorkspaceAppearance.setState({ colorMode, darkMode });
  if (darkMode !== previousDarkMode) {
    reprojectWorkspaceNodes();
  }
}

function stopSystemColorSchemeSync() {
  if (systemColorSchemeQuery && systemColorSchemeListener) {
    systemColorSchemeQuery.removeEventListener("change", systemColorSchemeListener);
  }
  systemColorSchemeQuery = null;
  systemColorSchemeListener = null;
}

function getSystemColorSchemeQuery(): MediaQueryList {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    throw new Error(
      "System workspace color mode requires window.matchMedia; choose light or dark during server rendering.",
    );
  }
  const mediaQuery = window.matchMedia(SYSTEM_DARK_MODE_QUERY);
  if (
    typeof mediaQuery.addEventListener !== "function" ||
    typeof mediaQuery.removeEventListener !== "function"
  ) {
    throw new Error("System workspace color mode requires MediaQueryList change-event support.");
  }
  return mediaQuery;
}

function startSystemColorSchemeSync(mediaQuery: MediaQueryList) {
  const listener = (event: MediaQueryListEvent) => {
    if (
      useWorkspaceAppearance.getState().colorMode === "system" &&
      systemColorSchemeQuery === mediaQuery
    ) {
      publishAppearance("system", event.matches);
    }
  };
  mediaQuery.addEventListener("change", listener);
  systemColorSchemeQuery = mediaQuery;
  systemColorSchemeListener = listener;
  publishAppearance("system", mediaQuery.matches);
}

export function setWorkspaceColorMode(colorMode: WorkspaceColorMode): void {
  if (colorMode !== "light" && colorMode !== "dark" && colorMode !== "system") {
    throw new Error(`Unknown workspace color mode: ${String(colorMode)}.`);
  }
  if (colorMode === "system") {
    // Resolve support before replacing a working mode/listener so a rejected system request is
    // atomic from the consumer's perspective.
    const mediaQuery = getSystemColorSchemeQuery();
    stopSystemColorSchemeSync();
    startSystemColorSchemeSync(mediaQuery);
    return;
  }
  stopSystemColorSchemeSync();
  publishAppearance(colorMode, colorMode === "dark");
}

// A direct store reset is useful in focused consumers/tests. It must not leave the process-level
// system media listener alive after the state returns to its explicit-light initial value.
useWorkspaceAppearance.subscribe((state) => {
  if (state.colorMode !== "system") {
    stopSystemColorSchemeSync();
  }
});
