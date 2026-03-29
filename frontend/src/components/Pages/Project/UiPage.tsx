import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import { useEffect, type ComponentType } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import {
  recordProjectChatPointerDownLocation,
  recordProjectChatPointerUpLocation,
} from "state/actions/projectChatWindowingPointerTracking";
import { clearCurrentProjectViewportForRefit } from "state/actions/sectionInfos";
import { useLocalStorage } from "state/definitions";
import { syncLiveDictAreaInteractionModeFromSearch } from "../../Section/Layouts/liveDictAreaInteractionMode";
import { syncLiveDictAreaRendererModeFromSearch } from "../../Section/Layouts/liveDictAreaRendererMode";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SettingsAllSettingsBenchmarkProvider } from "./settingsAllSettingsBenchmark";

type UIPageProps = {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function UIPage({ SectionBoundary }: UIPageProps) {
  useInitGlobalKeyEventListeners();
  useLastMouseDownMouseUpLocation();
  useSyncLiveDictAreaInteractionMode();
  useSyncLiveDictAreaRendererMode();
  const showMiniMap = useLocalStorage((x) => x.showMinimap);

  return (
    <SettingsAllSettingsBenchmarkProvider>
      <SectionDndContext>
        <div className="relative h-full min-h-0 w-full min-w-0">
          <ReactFlow SectionBoundary={SectionBoundary} />
          <PaneContextMenu />
          <SelectionContextMenu />
          <TypeErrorContextMenu />
          {showMiniMap && <ResponsiveMiniMap />}
        </div>
      </SectionDndContext>
    </SettingsAllSettingsBenchmarkProvider>
  );
}

function useSyncLiveDictAreaRendererMode() {
  useEffect(() => {
    const search =
      typeof globalThis.location === "object" ? globalThis.location.search : "";
    const { shouldClearViewportForRefit } =
      syncLiveDictAreaRendererModeFromSearch(search);

    // Any live renderer-mode switch can reopen the route under a different
    // body-height system than the viewport saved for the previous renderer.
    if (shouldClearViewportForRefit) {
      clearCurrentProjectViewportForRefit();
    }
  }, []);
}

function useSyncLiveDictAreaInteractionMode() {
  useEffect(() => {
    syncLiveDictAreaInteractionModeFromSearch(
      typeof globalThis.location === "object" ? globalThis.location.search : "",
    );
  }, []);
}

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}

function useLastMouseDownMouseUpLocation() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      recordProjectChatPointerDownLocation({
        x: event.clientX,
        y: event.clientY,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      recordProjectChatPointerUpLocation({
        x: event.clientX,
        y: event.clientY,
      });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);
}
