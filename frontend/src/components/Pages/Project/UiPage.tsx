import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import _ from "lodash";
import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { useLocalStorage, useMisc, useProjectState } from "state/definitions";
import { SettingsGraphSubstrateCanary } from "./graphSubstrate/SettingsGraphSubstrateCanary";
import {
  resolveActiveViewModeName,
  shouldUseSettingsGraphSubstrateCanary,
} from "./graphSubstrate/settingsGraphSubstrateCanaryModel";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  useLastMouseDownMouseUpLocation();
  const showMiniMap = useLocalStorage((x) => x.showMinimap);
  const shouldUseGraphSubstrateCanary = useProjectState((state) => {
    const activeViewModeName = resolveActiveViewModeName(state);
    return shouldUseSettingsGraphSubstrateCanary(
      state.projectConfig.name,
      activeViewModeName,
    );
  }, _.isEqual);

  return (
    <SectionDndContext>
      <div className="relative h-full min-h-0 w-full min-w-0">
        {shouldUseGraphSubstrateCanary ? (
          <SettingsGraphSubstrateCanary />
        ) : (
          <ReactFlow />
        )}
        <PaneContextMenu />
        <SelectionContextMenu />
        <TypeErrorContextMenu />
        {!shouldUseGraphSubstrateCanary && showMiniMap && <ResponsiveMiniMap />}
      </div>
    </SectionDndContext>
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
