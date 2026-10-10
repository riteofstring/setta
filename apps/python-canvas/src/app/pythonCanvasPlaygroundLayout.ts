import type { WorkspaceDocumentInput } from "@setta/workspace";

export function rocketLabLayout(
  document: WorkspaceDocumentInput,
): WorkspaceDocumentInput {
  const settings = "python-canvas:parameter-dictionary:launch-settings";
  const flights = "python-canvas:list:flights";
  const generated = "python-canvas:generated-python";
  const placements = {
    [settings]: { x: 0, y: 0, w: 390, h: 220, zIndex: 0 },
    [flights]: { x: 0, y: 268, w: 390, h: null, zIndex: 1 },
    [generated]: { x: 438, y: 0, w: 700, h: 640, zIndex: 2 },
  };
  const sections = { ...document.sections };
  const topLevelSections = { ...document.topLevelSections };
  for (const [id, placement] of Object.entries(placements)) {
    const section = sections[id];
    if (!section || !topLevelSections[id]) continue;
    sections[id] = {
      ...section,
      size: { width: placement.w, height: placement.h ?? "auto" },
    };
    topLevelSections[id] = placement;
  }
  for (const id of [
    "python-canvas:callable:earth",
    "python-canvas:callable:moon",
  ]) {
    const section = sections[id];
    if (section)
      sections[id] = { ...section, size: { width: 390, height: 270 } };
  }
  return { ...document, sections, topLevelSections };
}
