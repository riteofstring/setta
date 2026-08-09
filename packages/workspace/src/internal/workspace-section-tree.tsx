import { useCallback, useEffect, useState, type CSSProperties } from "react";

import type { WorkspaceDocument, WorkspacePoint, WorkspaceSection } from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  WorkspaceSectionFrame,
  type WorkspaceSectionFrameProps,
} from "./workspace-section-frame.js";
import { useWorkspaceChildRegionScrollability } from "./workspace-section-overflow.js";
import type {
  ResolvedSectionDefinition,
  WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";

export type WorkspaceSectionTreeNode = Readonly<{
  children: readonly WorkspaceSectionTreeNode[];
  definition: ResolvedSectionDefinition<unknown>;
  position: WorkspacePoint | null;
  section: WorkspaceSection<unknown>;
}>;

export type WorkspaceSectionTreeBindings = Pick<
  WorkspaceSectionFrameProps,
  | "appearance"
  | "colorPalette"
  | "geometry"
  | "layoutEditable"
  | "onKeyboardMove"
  | "onLockedCommit"
  | "onMinimizedCommit"
  | "onOrientationCommit"
  | "onOverflowCommit"
  | "onPositioningRequest"
  | "onPresentationCommit"
  | "onSelectionRequest"
  | "onTitleCommit"
  | "presentationEditable"
  | "readOnly"
  | "validateTitle"
  | "viewportCulling"
>;

function requireTreeSection<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
  sectionId: string,
  position: WorkspacePoint | null,
): WorkspaceSectionTreeNode {
  const section = document.sections[sectionId];
  const definition = section ? registry.definition(section.kind) : undefined;
  if (!section || !definition) {
    throw new Error(`Workspace section tree is missing registration for ${sectionId}.`);
  }
  const childIds = section.childLayout?.sectionIds ?? [];
  const childPositions =
    section.childLayout?.positioning === "freeform" ? section.childLayout.positions : null;
  return {
    children: childIds.map((childId) =>
      requireTreeSection(document, registry, childId, childPositions?.[childId] ?? null),
    ),
    definition: definition as ResolvedSectionDefinition<unknown>,
    position,
    section: section as WorkspaceSection<unknown>,
  };
}

export function projectWorkspaceSectionChildren<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
  parentSectionId: string,
): readonly WorkspaceSectionTreeNode[] {
  const parent = document.sections[parentSectionId];
  if (!parent) {
    throw new Error(`Workspace section tree is missing parent ${parentSectionId}.`);
  }
  const childPositions =
    parent.childLayout?.positioning === "freeform" ? parent.childLayout.positions : null;
  return (parent.childLayout?.sectionIds ?? []).map((sectionId) =>
    requireTreeSection(document, registry, sectionId, childPositions?.[sectionId] ?? null),
  );
}

function positionsMatch(left: WorkspacePoint | null, right: WorkspacePoint | null): boolean {
  return left === right || Boolean(left && right && left.x === right.x && left.y === right.y);
}

function synchronizeTreeNode(
  current: WorkspaceSectionTreeNode | undefined,
  projected: WorkspaceSectionTreeNode,
): WorkspaceSectionTreeNode {
  if (!current || current.section.id !== projected.section.id) {
    return projected;
  }
  const children = synchronizeWorkspaceSectionTrees(current.children, projected.children);
  if (
    children === current.children &&
    current.definition === projected.definition &&
    positionsMatch(current.position, projected.position) &&
    current.section === projected.section
  ) {
    return current;
  }
  return { ...projected, children };
}

export function synchronizeWorkspaceSectionTrees(
  current: readonly WorkspaceSectionTreeNode[],
  projected: readonly WorkspaceSectionTreeNode[],
): readonly WorkspaceSectionTreeNode[] {
  const currentById = new Map(current.map((node) => [node.section.id, node]));
  const synchronized = projected.map((node) =>
    synchronizeTreeNode(currentById.get(node.section.id), node),
  );
  const unchanged =
    current.length === synchronized.length &&
    synchronized.every((node, index) => node === current[index]);
  return unchanged ? current : synchronized;
}

type NestedSectionProps = Readonly<{
  bindings: WorkspaceSectionTreeBindings;
  depth: number;
  node: WorkspaceSectionTreeNode;
  order: number;
  parentSectionId: string;
}>;

function WorkspaceNestedSection({
  bindings,
  depth,
  node,
  order,
  parentSectionId,
}: NestedSectionProps) {
  const frame = (
    <WorkspaceSectionFrame
      {...bindings}
      childSectionRegion={
        <WorkspaceSectionChildren bindings={bindings} depth={depth} node={node} />
      }
      definition={node.definition}
      depth={depth}
      freeformChild={node.position !== null}
      moving={false}
      order={order}
      parentSectionId={parentSectionId}
      resizing={false}
      section={node.section}
    />
  );
  const positioning = node.position ? "freeform" : "ordered";
  const style = node.position
    ? ({
        transform: `translate(${String(node.position.x)}px, ${String(node.position.y)}px)`,
      } satisfies CSSProperties)
    : undefined;
  return (
    <div
      className="setta-workspace__child-placement"
      data-workspace-child-placement={node.section.id}
      data-workspace-child-placement-positioning={positioning}
      data-workspace-freeform-child-placement={node.position ? node.section.id : undefined}
      style={style}
    >
      {frame}
    </div>
  );
}

function EmptyChildSectionRegion() {
  return (
    <div className="setta-workspace__empty-child-container" data-workspace-empty-child-container="">
      Drop a section here
    </div>
  );
}

type FreeformSurfaceSize = Readonly<{ height: number; width: number }>;

function fallbackFreeformSurfaceSize(
  children: readonly WorkspaceSectionTreeNode[],
): FreeformSurfaceSize {
  return {
    height: Math.max(
      96,
      ...children.map((child) => (child.position?.y ?? 0) + child.section.size.height.value),
    ),
    width: Math.max(
      192,
      ...children.map((child) => (child.position?.x ?? 0) + child.section.size.width.value),
    ),
  };
}

function measuredFreeformSurfaceSize(
  element: HTMLDivElement,
  children: readonly WorkspaceSectionTreeNode[],
): FreeformSurfaceSize {
  const positions = new Map(children.map((child) => [child.section.id, child.position]));
  const HTMLElementConstructor = element.ownerDocument.defaultView?.HTMLElement;
  let width = 192;
  let height = 96;
  for (const placement of element.children) {
    const sectionId = placement.getAttribute("data-workspace-freeform-child-placement");
    const position = sectionId ? positions.get(sectionId) : null;
    if (!position || !HTMLElementConstructor || !(placement instanceof HTMLElementConstructor)) {
      continue;
    }
    width = Math.max(width, position.x + placement.offsetWidth);
    height = Math.max(height, position.y + placement.offsetHeight);
  }
  return { height, width };
}

function freeformSurfaceSizesMatch(left: FreeformSurfaceSize, right: FreeformSurfaceSize): boolean {
  return left.height === right.height && left.width === right.width;
}

function useFreeformSurfaceSize(children: readonly WorkspaceSectionTreeNode[], enabled: boolean) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const fallback = fallbackFreeformSurfaceSize(children);
  const [size, setSize] = useState<FreeformSurfaceSize>(fallback);
  useEffect(() => {
    if (!enabled || !element) {
      return;
    }
    const measure = () => {
      const measured = measuredFreeformSurfaceSize(element, children);
      setSize((current) => (freeformSurfaceSizesMatch(current, measured) ? current : measured));
    };
    measure();
    const ResizeObserverConstructor = element.ownerDocument.defaultView?.ResizeObserver;
    if (!ResizeObserverConstructor) {
      return;
    }
    const observer = new ResizeObserverConstructor(measure);
    for (const placement of element.children) {
      observer.observe(placement);
    }
    return () => observer.disconnect();
  }, [children, element, enabled]);
  return {
    ref: setElement,
    style: enabled
      ? ({
          blockSize: Math.max(fallback.height, size.height),
          inlineSize: Math.max(fallback.width, size.width),
        } satisfies CSSProperties)
      : undefined,
  };
}

function PositionedChildren({
  bindings,
  depth,
  node,
}: Readonly<{
  bindings: WorkspaceSectionTreeBindings;
  depth: number;
  node: WorkspaceSectionTreeNode;
}>) {
  const positioning = node.section.childLayout?.positioning ?? "ordered";
  const freeform = positioning === "freeform";
  const surfaceSize = useFreeformSurfaceSize(node.children, freeform);
  return (
    <div
      className="setta-workspace__child-surface"
      data-workspace-child-surface=""
      data-workspace-child-surface-positioning={positioning}
      data-workspace-freeform-child-surface={freeform ? "" : undefined}
      ref={surfaceSize.ref}
      style={surfaceSize.style}
    >
      {node.children.length === 0 ? (
        <EmptyChildSectionRegion />
      ) : (
        node.children.map((child, order) => (
          <WorkspaceNestedSection
            bindings={bindings}
            depth={depth + 1}
            key={child.section.id}
            node={child}
            order={order}
            parentSectionId={node.section.id}
          />
        ))
      )}
    </div>
  );
}

export function WorkspaceSectionChildren({
  bindings,
  depth,
  node,
}: Readonly<{
  bindings: WorkspaceSectionTreeBindings;
  depth: number;
  node: WorkspaceSectionTreeNode;
}>) {
  const layout = node.section.childLayout;
  const scrollMode = layout?.overflow === "scroll";
  const scrollability = useWorkspaceChildRegionScrollability(node.children, scrollMode);
  const geometry = bindings.geometry;
  const scrollabilityRef = scrollability.ref;
  const parentSectionId = node.section.id;
  const regionRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollabilityRef(element);
      if (!element) {
        return;
      }
      const unregister = geometry.registerChildRegion({ element, parentSectionId });
      return () => {
        unregister();
        scrollabilityRef(null);
      };
    },
    [geometry, parentSectionId, scrollabilityRef],
  );
  if (!layout) {
    return null;
  }
  return (
    <div
      aria-label={`${node.section.title} child sections`}
      className={`setta-workspace__section-children setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}${scrollability.scrollable ? ` ${WORKSPACE_NO_WHEEL_CLASS_NAME}` : ""}`}
      data-workspace-child-orientation={
        layout.positioning === "ordered" ? layout.orientation : undefined
      }
      data-workspace-child-overflow={layout.overflow}
      data-workspace-child-positioning={layout.positioning}
      data-workspace-section-child-region={node.section.id}
      data-workspace-prevent-pan="true"
      data-workspace-prevent-wheel={scrollability.scrollable ? "true" : undefined}
      data-workspace-scrollable={String(scrollability.scrollable)}
      ref={regionRef}
      role={scrollMode ? "region" : "group"}
      tabIndex={scrollability.scrollable ? 0 : undefined}
    >
      <PositionedChildren bindings={bindings} depth={depth} node={node} />
    </div>
  );
}
