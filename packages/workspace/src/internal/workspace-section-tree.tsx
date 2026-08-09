import type { WorkspaceDocument, WorkspaceSection } from "../core.js";
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
  section: WorkspaceSection<unknown>;
  selected: boolean;
  selectionMovementBlocked: boolean;
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
  | "onPresentationCommit"
  | "onSelectionRequest"
  | "onTitleCommit"
  | "presentationEditable"
  | "readOnly"
  | "validateTitle"
>;

function requireTreeSection<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
  sectionId: string,
  selectedSectionIds: ReadonlySet<string>,
  selectionMovementBlocked: boolean,
): WorkspaceSectionTreeNode {
  const section = document.sections[sectionId];
  const definition = section ? registry.definition(section.kind) : undefined;
  if (!section || !definition) {
    throw new Error(`Workspace section tree is missing registration for ${sectionId}.`);
  }
  const childIds = section.childLayout?.sectionIds ?? [];
  return {
    children: childIds.map((childId) =>
      requireTreeSection(document, registry, childId, selectedSectionIds, selectionMovementBlocked),
    ),
    definition: definition as ResolvedSectionDefinition<unknown>,
    section: section as WorkspaceSection<unknown>,
    selected: selectedSectionIds.has(sectionId),
    selectionMovementBlocked: selectedSectionIds.has(sectionId) && selectionMovementBlocked,
  };
}

export function projectWorkspaceSectionChildren<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
  parentSectionId: string,
  selectedSectionIds: ReadonlySet<string>,
  selectionMovementBlocked = false,
): readonly WorkspaceSectionTreeNode[] {
  const parent = document.sections[parentSectionId];
  if (!parent) {
    throw new Error(`Workspace section tree is missing parent ${parentSectionId}.`);
  }
  return (parent.childLayout?.sectionIds ?? []).map((sectionId) =>
    requireTreeSection(document, registry, sectionId, selectedSectionIds, selectionMovementBlocked),
  );
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
    current.section === projected.section &&
    current.selected === projected.selected &&
    current.selectionMovementBlocked === projected.selectionMovementBlocked
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
  return (
    <WorkspaceSectionFrame
      {...bindings}
      childSectionRegion={
        <WorkspaceSectionChildren bindings={bindings} depth={depth} node={node} />
      }
      definition={node.definition}
      depth={depth}
      moving={false}
      order={order}
      parentSectionId={parentSectionId}
      resizing={false}
      section={node.section}
      selected={node.selected}
      selectionMovementBlocked={node.selectionMovementBlocked}
    />
  );
}

function EmptyChildSectionRegion() {
  return (
    <div className="setta-workspace__empty-child-container" data-workspace-empty-child-container="">
      Drop a section here
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
  if (!layout) {
    return null;
  }
  return (
    <div
      aria-label={`${node.section.title} child sections`}
      className={`setta-workspace__section-children setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}${scrollability.scrollable ? ` ${WORKSPACE_NO_WHEEL_CLASS_NAME}` : ""}`}
      data-workspace-child-orientation={layout.orientation}
      data-workspace-child-overflow={layout.overflow}
      data-workspace-section-child-region={node.section.id}
      data-workspace-prevent-pan="true"
      data-workspace-prevent-wheel={scrollability.scrollable ? "true" : undefined}
      data-workspace-scrollable={String(scrollability.scrollable)}
      ref={scrollability.ref}
      role={scrollMode ? "region" : "group"}
      tabIndex={scrollability.scrollable ? 0 : undefined}
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
