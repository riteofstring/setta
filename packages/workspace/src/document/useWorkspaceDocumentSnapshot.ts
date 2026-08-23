import { useMemo } from "react";

import { useActiveSections, useWorkspaceDocument } from "./stores";
import type { WorkspaceDocument } from "./types";

// Public composition hook for host-owned pane content rendered below WorkspaceProvider. It reads
// the package stores directly, so a UI observer does not consume a second public host document
// subscription or require access to package-private selectors.
export function useWorkspaceDocumentSnapshot(): WorkspaceDocument {
  const sections = useWorkspaceDocument((state) => state.sections);
  const topLevelSections = useWorkspaceDocument(
    (state) => state.topLevelSections,
  );
  const viewport = useWorkspaceDocument((state) => state.viewport);
  const activeIds = useActiveSections((state) => state.activeIds);
  return useMemo(
    () => ({ activeIds, sections, topLevelSections, viewport }),
    [activeIds, sections, topLevelSections, viewport],
  );
}
