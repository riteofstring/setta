import { SectionContainer } from "components/Section/Container/SectionContainer";
import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";
import { HTML_SURFACE_CAPTURE_TARGET_FOR_ATTRIBUTE } from "gpuFlow/htmlSurfaces/sourceDom";
import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";
import { useLayoutEffect, useRef } from "react";
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
  return (
    <>
      <SectionContainer
        sectionId={node.nodeId}
        isTopLevel={sceneNode.parentSectionId === null}
      />
      {retainedContentSectionIds.has(node.nodeId) ? (
        <ProjectGpuRetainedSectionTextureCaptureTarget
          height={node.textureCssHeight ?? node.height ?? 1}
          sectionId={node.nodeId}
          width={node.textureCssWidth ?? node.width ?? 1}
        />
      ) : null}
    </>
  );
}

export function getProjectSceneSectionById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
}

const EMPTY_RETAINED_SECTION_IDS: ReadonlySet<string> = new Set();

type ProjectGpuRetainedSectionTextureCaptureTargetProps = {
  readonly height: number;
  readonly sectionId: string;
  readonly width: number;
};

function ProjectGpuRetainedSectionTextureCaptureTarget({
  height,
  sectionId,
  width,
}: ProjectGpuRetainedSectionTextureCaptureTargetProps) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const captureTargetRef = useRef<HTMLCanvasElement | null>(null);
  const { name, type } = useProjectState((state) => {
    const section = state.sections[sectionId];
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    return {
      name: section?.name ?? sectionId,
      type: impl.type,
    };
  }, shallow);
  const canvasWidth = Math.max(1, Math.ceil(width));
  const canvasHeight = Math.max(1, Math.ceil(height));

  useLayoutEffect(() => {
    const host = markerRef.current?.parentElement;
    const parent = host?.parentElement;
    if (!host || !parent) {
      return;
    }
    const captureTarget =
      captureTargetRef.current ?? parent.ownerDocument.createElement("canvas");
    captureTargetRef.current = captureTarget;
    captureTarget.setAttribute("aria-hidden", "true");
    captureTarget.setAttribute("data-section-id", sectionId);
    captureTarget.setAttribute("data-section-type", type);
    captureTarget.setAttribute(
      HTML_SURFACE_CAPTURE_TARGET_FOR_ATTRIBUTE,
      sectionId,
    );
    if (captureTarget.parentNode !== parent) {
      parent.insertBefore(captureTarget, host.nextSibling);
    }
    drawProjectGpuRetainedSectionTextureCaptureTarget({
      canvas: captureTarget,
      height: canvasHeight,
      title: name,
      width: canvasWidth,
    });
    return () => {
      captureTarget.remove();
      if (captureTargetRef.current === captureTarget) {
        captureTargetRef.current = null;
      }
    };
  }, [canvasHeight, canvasWidth, name, sectionId, type]);

  return <span aria-hidden="true" ref={markerRef} style={{ display: "none" }} />;
}

function drawProjectGpuRetainedSectionTextureCaptureTarget({
  canvas,
  height,
  title,
  width,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly height: number;
  readonly title: string;
  readonly width: number;
}) {
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  if (width < 32 || height < 16) {
    return;
  }
  context.fillStyle = "#334155";
  context.font =
    '600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textBaseline = "middle";
  context.save();
  context.beginPath();
  context.rect(12, 0, Math.max(0, width - 24), 32);
  context.clip();
  context.fillText(title, 12, 16);
  context.restore();
}
