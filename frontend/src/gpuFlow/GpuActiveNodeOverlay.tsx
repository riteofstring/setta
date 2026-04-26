import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { GpuNodeLayout } from "./GpuNodeLayer";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "./viewportMath";

export type GpuActiveNodeOverlaySnapshot = {
  readonly frame: number;
  readonly height: number;
  readonly nodeId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly sourceElement: HTMLElement;
  readonly width: number;
  readonly zIndex: number;
  readonly zoom: number;
};

type ResolveGpuActiveNodeOverlaySnapshotInput = {
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly overlayNodeId: string | null | undefined;
  readonly viewport: GpuViewportInput;
};

type GpuActiveNodeOverlayProps = {
  readonly snapshot: GpuActiveNodeOverlaySnapshot | null;
};

const OVERLAY_SNAPSHOT_COMPARE_KEYS = [
  "frame",
  "height",
  "nodeId",
  "screenX",
  "screenY",
  "sourceElement",
  "width",
  "zIndex",
  "zoom",
] as const;

export function GpuActiveNodeOverlay({ snapshot }: GpuActiveNodeOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !snapshot) {
      return;
    }
    const clone = cloneActiveNodeOverlaySource(snapshot);
    overlay.replaceChildren(clone);
    overlay.setAttribute("inert", "");
    return () => {
      overlay.replaceChildren();
      overlay.removeAttribute("inert");
    };
  }, [snapshot]);

  if (!snapshot) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="setta-gpu-flow__active-node-overlay-layer"
      data-gpu-flow-active-node-overlay-layer="true"
    >
      <div
        className="setta-gpu-flow__active-node-overlay"
        data-gpu-flow-active-node-overlay="true"
        data-id={snapshot.nodeId}
        ref={overlayRef}
        style={activeNodeOverlayStyle(snapshot)}
      />
    </div>
  );
}

export function resolveGpuActiveNodeOverlaySnapshot({
  elementByNodeId,
  frame,
  nodes,
  overlayNodeId,
  viewport,
}: ResolveGpuActiveNodeOverlaySnapshotInput): GpuActiveNodeOverlaySnapshot | null {
  if (!overlayNodeId || !nodes) {
    return null;
  }
  const node = nodes.find((candidate) => candidate.nodeId === overlayNodeId);
  if (!isRenderableGpuActiveNodeOverlay(node)) {
    return null;
  }
  const sourceElement = elementByNodeId.get(node.nodeId);
  if (!sourceElement) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(viewport);
  const screenPosition = flowToScreenPosition(
    { x: node.x, y: node.y },
    normalizedViewport,
  );
  return {
    frame,
    height: node.height,
    nodeId: node.nodeId,
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    sourceElement,
    width: node.width,
    zIndex: node.tempZIndex ?? node.zIndex ?? 0,
    zoom: normalizedViewport.zoom,
  };
}

export function areGpuActiveNodeOverlaySnapshotsEqual(
  left: GpuActiveNodeOverlaySnapshot | null,
  right: GpuActiveNodeOverlaySnapshot | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return OVERLAY_SNAPSHOT_COMPARE_KEYS.every((key) => left[key] === right[key]);
}

function isRenderableGpuActiveNodeOverlay(
  node: GpuNodeLayout | undefined,
): node is GpuNodeLayout & { readonly height: number; readonly width: number } {
  return Boolean(
    node &&
      node.width !== null &&
      node.height !== null &&
      node.width > 0 &&
      node.height > 0,
  );
}

function activeNodeOverlayStyle(
  snapshot: GpuActiveNodeOverlaySnapshot,
): CSSProperties {
  return {
    height: snapshot.height,
    left: 0,
    position: "absolute",
    top: 0,
    transform: `translate(${snapshot.screenX}px, ${snapshot.screenY}px) scale(${snapshot.zoom})`,
    transformOrigin: "0 0",
    width: snapshot.width,
    zIndex: snapshot.zIndex,
  };
}

function cloneActiveNodeOverlaySource(
  snapshot: GpuActiveNodeOverlaySnapshot,
): HTMLElement {
  const clone = snapshot.sourceElement.cloneNode(true) as HTMLElement;
  clone.dataset.gpuFlowActiveNodeOverlayClone = "true";
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  clone.style.position = "relative";
  clone.style.left = "0px";
  clone.style.top = "0px";
  clone.style.width = `${snapshot.width}px`;
  clone.style.height = `${snapshot.height}px`;
  clone.style.transform = "none";
  clone.style.transformOrigin = "0 0";
  clone.style.pointerEvents = "none";
  syncOverlayCloneFormState(snapshot.sourceElement, clone);
  return clone;
}

function syncOverlayCloneFormState(source: HTMLElement, clone: HTMLElement) {
  const sourceControls = collectFormControls(source);
  const cloneControls = collectFormControls(clone);
  sourceControls.forEach((sourceControl, index) => {
    const cloneControl = cloneControls[index];
    if (!cloneControl) {
      return;
    }
    syncFormControlState(sourceControl, cloneControl);
  });
}

function collectFormControls(root: HTMLElement): HTMLElement[] {
  return [
    ...(isFormControl(root) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>("input, textarea, select"),
  ];
}

function isFormControl(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function syncFormControlState(source: HTMLElement, clone: HTMLElement) {
  if (syncInputState(source, clone)) {
    return;
  }
  if (syncTextAreaState(source, clone)) {
    return;
  }
  syncSelectState(source, clone);
}

function syncInputState(source: HTMLElement, clone: HTMLElement): boolean {
  if (
    !(source instanceof HTMLInputElement && clone instanceof HTMLInputElement)
  ) {
    return false;
  }
  clone.value = source.value;
  clone.checked = source.checked;
  clone.indeterminate = source.indeterminate;
  return true;
}

function syncTextAreaState(source: HTMLElement, clone: HTMLElement): boolean {
  if (
    !(
      source instanceof HTMLTextAreaElement &&
      clone instanceof HTMLTextAreaElement
    )
  ) {
    return false;
  }
  clone.value = source.value;
  return true;
}

function syncSelectState(source: HTMLElement, clone: HTMLElement) {
  if (
    !(source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement)
  ) {
    return;
  }
  clone.selectedIndex = source.selectedIndex;
  for (let index = 0; index < source.options.length; index += 1) {
    const sourceOption = source.options[index];
    const cloneOption = clone.options[index];
    if (sourceOption && cloneOption) {
      cloneOption.selected = sourceOption.selected;
    }
  }
}
