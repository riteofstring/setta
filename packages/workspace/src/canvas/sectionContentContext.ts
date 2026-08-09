import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceSection } from "../document/types";

// The provisional renderer seam: the host supplies the section body rendered inside the
// package-owned shell, chrome, and header. Phase 2 ratifies the registration surface
// (kind → renderer/icon/default size).
export type SectionContentRenderer = (section: WorkspaceSection) => ReactNode;

export const SectionContentRendererContext = createContext<SectionContentRenderer | null>(null);

export function useSectionContentRenderer(): SectionContentRenderer {
  const renderSectionContent = useContext(SectionContentRendererContext);
  if (renderSectionContent === null) {
    throw new Error("Canvas nodes rendered outside a WorkspaceCanvas section content provider.");
  }
  return renderSectionContent;
}
