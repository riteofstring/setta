import { validateWorkspaceDocument, type WorkspaceDocument, type WorkspacePoint } from "../core.js";

export type WorkspaceCanvasRoot = Readonly<{
  kind: string;
  order: number;
  position: WorkspacePoint;
  sectionId: string;
  size: Readonly<{ height: number; width: number }>;
  title: string;
}>;

export function projectWorkspaceCanvasRoots<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): readonly WorkspaceCanvasRoot[] {
  validateWorkspaceDocument(document);
  return document.rootSections.map(({ position, sectionId }, order) => {
    const section = document.sections[sectionId];
    if (!section) {
      throw new Error(`Workspace root projection is missing section ${sectionId}.`);
    }
    return {
      kind: section.kind,
      order,
      position: { ...position },
      sectionId,
      size: {
        height: section.size.height.value,
        width: section.size.width.value,
      },
      title: section.title,
    };
  });
}
