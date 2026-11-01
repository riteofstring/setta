import { useMemo } from "react";

import { useActiveSections, useWorkspaceDocument } from "./stores.js";
import type { WorkspaceDocument } from "./types.js";

export function useWorkspaceDocumentSnapshot(): WorkspaceDocument {
  const sections = useWorkspaceDocument((state) => state.sections);
  const topLevelSections = useWorkspaceDocument(
    (state) => state.topLevelSections,
  );
  const viewport = useWorkspaceDocument((state) => state.viewport);
  const activeIds = useActiveSections((state) => state.activeIds);
  const savedViews = useWorkspaceDocument((state) => state.savedViews);
  return useMemo(
    () => ({ activeIds, savedViews, sections, topLevelSections, viewport }),
    [activeIds, savedViews, sections, topLevelSections, viewport],
  );
}
