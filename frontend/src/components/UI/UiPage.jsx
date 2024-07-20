import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { localStorageFns } from "state/hooks/localStorageHooks";
import { DeckContextMenu } from "utils/ContextMenus/DeckContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  const [showMiniMap] = localStorageFns.showMinimap.hook();

  return (
    <GlobalDndContext>
      <SectionsPane />
      <PaneContextMenu />
      <SelectionContextMenu />
      <DeckContextMenu />
      {showMiniMap && <ResponsiveMiniMap />}
      <ResponsiveControls />
    </GlobalDndContext>
  );
}

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}
