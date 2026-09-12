import { useWorkspaceAppearance } from "../document/stores";

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
