import { WorkspaceWindowManager } from "./WorkspaceWindowManager";
import { useOptionalWorkspaceWindowing } from "./workspaceWindowingContext";

export function IntegratedWorkspaceWindowManager() {
  const windowing = useOptionalWorkspaceWindowing();
  if (!windowing) {
    throw new Error(
      "IntegratedWorkspaceWindowManager requires WorkspaceWindowingContextProvider.",
    );
  }
  return (
    <WorkspaceWindowManager
      ariaLabel={windowing.ariaLabel}
      boundaryInsets={windowing.viewport.insets}
      className={windowing.className}
      layoutEditable={windowing.layoutEditable}
      onStateChange={windowing.onStateChange}
      renderers={windowing.renderers}
      shortcuts={windowing.shortcuts}
      state={windowing.state}
    />
  );
}
