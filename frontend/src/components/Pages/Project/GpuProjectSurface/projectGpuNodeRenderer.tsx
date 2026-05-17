import { SectionContainer } from "components/Section/Container/SectionContainer";
import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";
import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";
import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { shallow } from "zustand/shallow";

export function renderProjectGpuNode(
  node: GpuNodeLayout,
  sceneSectionById: ReadonlyMap<string, GpuSectionSceneNode>,
  retainedContentSectionIds: ReadonlySet<string> = EMPTY_RETAINED_SECTION_IDS,
) {
  const sceneNode = sceneSectionById.get(node.nodeId);
  if (!sceneNode) {
    throw new Error(`Missing GPU project scene section ${node.nodeId}.`);
  }
  if (retainedContentSectionIds.has(node.nodeId)) {
    return (
      <ProjectGpuRetainedSectionSourceShell
        sectionId={node.nodeId}
        isTopLevel={sceneNode.parentSectionId === null}
      />
    );
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

export function getProjectRetainedContentSectionIds(
  scene: GpuFlowScene,
): ReadonlySet<string> {
  return new Set(
    scene.contentSurfaces.flatMap((surface) =>
      surface.renderer.kind === "canvas-content" && surface.retainedScene
        ? [surface.ownerSectionId]
        : [],
    ),
  );
}

const EMPTY_RETAINED_SECTION_IDS: ReadonlySet<string> = new Set();

type ProjectGpuRetainedSectionSourceShellProps = {
  readonly isTopLevel: boolean;
  readonly sectionId: string;
};

const ProjectGpuRetainedSectionSourceShell = React.memo(
  function ProjectGpuRetainedSectionSourceShell({
    isTopLevel,
    sectionId,
  }: ProjectGpuRetainedSectionSourceShellProps) {
    const { name, type } = useProjectState((state) => {
      const section = state.sections[sectionId];
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      return {
        name: section?.name ?? sectionId,
        type: impl.type,
      };
    }, shallow);
    return (
      <section
        className={`relative overflow-hidden rounded-lg border border-white bg-white outline outline-4 outline-transparent dark:border-setta-700 dark:bg-setta-925 ${
          isTopLevel ? "h-full w-full" : "w-min"
        }`}
        data-section-id={sectionId}
        data-section-type={type}
      >
        <div className="flex h-8 items-center truncate border-b border-setta-200/70 px-3 text-xs font-semibold text-setta-700 dark:border-setta-800 dark:text-setta-200">
          {name}
        </div>
      </section>
    );
  },
);
