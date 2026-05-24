import type { GpuFlowScene } from "gpuFlow/scene";

export function getProjectKeyboardScrollParentSectionId(
  scene: GpuFlowScene,
  selectedSectionId: string | null,
): string | null {
  if (!selectedSectionId) {
    return null;
  }
  const sectionById = new Map(
    scene.sections.map((section) => [section.sectionId, section]),
  );
  const selectedSection = sectionById.get(selectedSectionId);
  if (!selectedSection) {
    return null;
  }
  if (selectedSection.childSectionIds.length > 0) {
    return selectedSection.sectionId;
  }
  return selectedSection.parentSectionId;
}
