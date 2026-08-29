import { useWorkspaceAppearance } from "../document/stores";

// The compiled stylesheet scopes its base rules (scopedBase.css) under this marker class, so
// every DOM root the package renders must carry it — the canvas, the separately mounted toolbar
// and tooltip surfaces, and the drag overlays portaled to document.body.
const WORKSPACE_SCOPE_CLASS_NAME = "setta-workspace";

const WORKSPACE_DARK_SCOPE_CLASS_NAME = "setta-workspace-dark";

export function getWorkspaceScopeClassName(darkMode: boolean): string {
  return darkMode
    ? `${WORKSPACE_SCOPE_CLASS_NAME} ${WORKSPACE_DARK_SCOPE_CLASS_NAME}`
    : WORKSPACE_SCOPE_CLASS_NAME;
}

export function useWorkspaceScopeClassName(): string {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  return getWorkspaceScopeClassName(darkMode);
}
