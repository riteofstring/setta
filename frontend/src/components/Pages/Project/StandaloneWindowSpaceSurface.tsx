import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { type WindowSpaceConfig } from "utils/generatedTypes";
import { StandaloneWindowSpaceCanvas } from "./StandaloneWindowSpaceCanvas";
import { useStandaloneWindowSpaceController } from "./useStandaloneWindowSpaceController";

export function StandaloneWindowSpaceSurface({
  windowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
}: {
  windowSpace: WindowSpaceConfig;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
}) {
  const {
    containerRef,
    projectConfigId,
    visibleWindows,
    shouldShowManagedChatBlockedSurface,
    snapResizeHandles,
    handleFocusWindow,
    handleProjectChatIdChange,
    handleEmbeddedGitPaneVisibleChange,
    handleBlockedErrorCodeChange,
    handleSnapResizePointerDown,
    handleSnapResizePointerMove,
    handleSnapResizePointerUp,
  } = useStandaloneWindowSpaceController({
    windowSpace,
    canUseManagedChat,
    managedChatAuthorityState,
  });

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-setta-100/80 dark:bg-setta-950"
      data-testid="standalone-window-space-surface"
    >
      <StandaloneWindowSpaceCanvas
        visibleWindows={visibleWindows}
        shouldShowManagedChatBlockedSurface={
          shouldShowManagedChatBlockedSurface
        }
        projectConfigId={projectConfigId}
        windowSpaceId={windowSpace.id}
        snapResizeHandles={snapResizeHandles}
        onFocusWindow={handleFocusWindow}
        onProjectChatIdChange={handleProjectChatIdChange}
        onEmbeddedGitPaneVisibleChange={handleEmbeddedGitPaneVisibleChange}
        onBlockedErrorCodeChange={handleBlockedErrorCodeChange}
        onSnapResizePointerDown={handleSnapResizePointerDown}
        onSnapResizePointerMove={handleSnapResizePointerMove}
        onSnapResizePointerUp={handleSnapResizePointerUp}
      />
    </section>
  );
}
