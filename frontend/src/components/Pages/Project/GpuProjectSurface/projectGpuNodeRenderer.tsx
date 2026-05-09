import { SectionContainer } from "components/Section/Container/SectionContainer";
import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";
import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";

export function renderProjectGpuNode(
  node: GpuNodeLayout,
  sceneSectionById: ReadonlyMap<string, GpuSectionSceneNode>,
) {
  const sceneNode = sceneSectionById.get(node.nodeId);
  if (!sceneNode) {
    throw new Error(`Missing GPU project scene section ${node.nodeId}.`);
  }
  return (
    <SectionContainer
      sectionId={node.nodeId}
      isTopLevel={sceneNode.parentSectionId === null}
    />
  );
}

export function getProjectSceneSectionById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
}
