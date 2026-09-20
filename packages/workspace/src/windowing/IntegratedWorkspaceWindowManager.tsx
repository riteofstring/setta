import { WorkspaceWindowManager } from "./WorkspaceWindowManager";
import { useOptionalWorkspaceWindowing } from "./workspaceWindowingContext";

export function IntegratedWorkspaceWindowManager() {
  const windowing = useOptionalWorkspaceWindowing();
  if (!windowing) {
    throw new Error(
      "IntegratedWorkspaceWindowManager requires WorkspaceWindowingContextProvider.",
    );
  }
  if (!windowing.boundaryInsets) return null;
  return (
    <WorkspaceWindowManager
      ariaLabel={windowing.ariaLabel}
      boundaryInsets={windowing.boundaryInsets}
      className={windowing.className}
      layoutEditable={windowing.layoutEditable}
      onStateChange={windowing.onStateChange}
      onViewportChange={windowing.onViewportChange}
      renderers={windowing.renderers}
      shortcuts={windowing.shortcuts}
      state={windowing.state}
    />
  );
}
