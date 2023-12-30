import { useGroupSectionsOnKeyActivation } from "hooks/useGroupSectionsOnKeyActivation";
import { useInitGlobalReactFlowStore } from "hooks/useInitGlobalReactFlowStore";
import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect } from "react";
import { attachKeyEventListeners } from "thunks/keyActivations";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  const viewport = useProjectConfig((x) => x.viewport, _.isEqual);
  const topLevelSectionPositions = useProjectConfig(
    (x) => x.children,
    _.isEqual
  );
  const initialNodes = _.map(topLevelSectionPositions, (v, k) => ({
    id: k,
    position: { x: v.x, y: v.y },
    type: "sectionContainerNode",
    zIndex: v.zIndex,
    style: { visibility: "visible" }, // needed to prevent flickering
  }));

  useGroupSectionsOnKeyActivation();
  useInitGlobalReactFlowStore();

  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);

  return (
    <GlobalDndContext>
      <SectionsPane initialNodes={initialNodes} viewport={viewport} />
    </GlobalDndContext>
  );
}
