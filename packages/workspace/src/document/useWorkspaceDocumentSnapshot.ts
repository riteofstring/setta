import { useMemo } from "react";

import { useActiveSections, useWorkspaceDocument } from "./stores";
import type { WorkspaceDocument } from "./types";

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
