import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import { useEffect, type ComponentType } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { useLocalStorage, useMisc } from "state/definitions";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SettingsAllSettingsBenchmarkProvider } from "./settingsAllSettingsBenchmark";

type UIPageProps = {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function UIPage({ SectionBoundary }: UIPageProps) {
  useInitGlobalKeyEventListeners();
  useLastMouseDownMouseUpLocation();
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

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}

function useLastMouseDownMouseUpLocation() {
  useEffect(() => {
    const handlePointerDown = (e) => {
      useMisc.setState({
        lastMouseDownLocation: { x: e.clientX, y: e.clientY },
      });
    };

    const handlePointerUp = (e) => {
      useMisc.setState({
        lastMouseUpLocation: { x: e.clientX, y: e.clientY },
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
