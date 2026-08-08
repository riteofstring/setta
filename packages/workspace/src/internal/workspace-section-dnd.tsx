import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { InteractionInput } from "./interaction-owner.js";
import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";
import {
  UpstreamDndBoundary,
  useUpstreamDndDraggable,
  type AdapterDndCompletion,
  type AdapterDndEvent,
} from "./upstream-dnd-adapter.js";
import type { WorkspaceStructuralInteractionStart } from "./workspace-interaction-owner.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

const ROOT_SECTION_DND_PREFIX = "setta-workspace-root-section:";
const NESTED_SECTION_DND_PREFIX = "setta-workspace-nested-section:";

type WorkspaceSectionDndSource = Readonly<{
  root: boolean;
  sectionId: string;
}>;

type WorkspaceSectionDndContextValue = Readonly<{
  activationEnabled: boolean;
  activeSectionId: string | null;
  activeSectionMode: WorkspaceSectionMoveMode | null;
  layoutEditable: boolean;
  mode: WorkspaceSectionMoveMode;
  rootLayoutActive: boolean;
  structureEditable: boolean;
}>;

const WorkspaceSectionDndContext = createContext<WorkspaceSectionDndContextValue | null>(null);
const DISABLED_SECTION_DND_CONTEXT: WorkspaceSectionDndContextValue = {
  activationEnabled: false,
  activeSectionId: null,
  activeSectionMode: null,
  layoutEditable: false,
  mode: "sort",
  rootLayoutActive: false,
  structureEditable: false,
};

function sourceId(sectionId: string, root: boolean): string {
  return `${root ? ROOT_SECTION_DND_PREFIX : NESTED_SECTION_DND_PREFIX}${sectionId}`;
}

function workspaceSectionDndSource(id: string): WorkspaceSectionDndSource {
  if (id.startsWith(ROOT_SECTION_DND_PREFIX)) {
    return { root: true, sectionId: id.slice(ROOT_SECTION_DND_PREFIX.length) };
  }
  if (id.startsWith(NESTED_SECTION_DND_PREFIX)) {
    return { root: false, sectionId: id.slice(NESTED_SECTION_DND_PREFIX.length) };
  }
  throw new Error(`Unknown workspace section drag source ${JSON.stringify(id)}.`);
}

function interactionInput(input: AdapterDndEvent["input"]): InteractionInput {
  return input;
}

function sectionUsesStructuralDrag(
  context: WorkspaceSectionDndContextValue,
  depth: number,
  sectionId: string,
): boolean {
  if (depth === 0 && context.rootLayoutActive) {
    return false;
  }
  return context.activeSectionId === sectionId || depth > 0 || context.mode === "free";
}

function sectionStructuralDragEnabled(
  context: WorkspaceSectionDndContextValue,
  blocked: boolean,
  sectionId: string,
  structural: boolean,
): boolean {
  if (blocked || !structural) {
    return false;
  }
  return (
    context.activeSectionId === sectionId ||
    (context.activationEnabled && context.layoutEditable && context.structureEditable)
  );
}

function sectionStructuralDragMode(
  context: WorkspaceSectionDndContextValue,
  sectionId: string,
): WorkspaceSectionMoveMode {
  return context.activeSectionId === sectionId
    ? (context.activeSectionMode ?? context.mode)
    : context.mode;
}

export function WorkspaceSectionDndBoundary({
  activationEnabled,
  activeSectionId,
  activeSectionMode,
  children,
  layoutEditable,
  mode,
  onComplete,
  onSelectionRequest,
  onStart,
  rootLayoutActive,
  sectionTitle,
  selectedSectionIds,
  structureEditable,
}: Readonly<{
  activationEnabled: boolean;
  activeSectionId: string | null;
  activeSectionMode: WorkspaceSectionMoveMode | null;
  children: ReactNode;
  layoutEditable: boolean;
  mode: WorkspaceSectionMoveMode;
  onComplete(canceled: boolean): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onStart(start: WorkspaceStructuralInteractionStart): void;
  rootLayoutActive: boolean;
  sectionTitle(sectionId: string): string;
  selectedSectionIds: readonly string[];
  structureEditable: boolean;
}>) {
  const context = useMemo<WorkspaceSectionDndContextValue>(
    () => ({
      activationEnabled,
      activeSectionId,
      activeSectionMode,
      layoutEditable,
      mode,
      rootLayoutActive,
      structureEditable,
    }),
    [
      activationEnabled,
      activeSectionId,
      activeSectionMode,
      layoutEditable,
      mode,
      rootLayoutActive,
      structureEditable,
    ],
  );
  const handleStart = (event: AdapterDndEvent) => {
    const source = workspaceSectionDndSource(event.sourceId);
    if (event.input === "touch") {
      onSelectionRequest(source.sectionId, {
        additive: false,
        preserveSelected: selectedSectionIds.includes(source.sectionId),
      });
    }
    onStart({
      input: interactionInput(event.input),
      mode,
      root: source.root,
      sectionId: source.sectionId,
      title: sectionTitle(source.sectionId),
    });
  };
  const handleComplete = (completion: AdapterDndCompletion) => {
    workspaceSectionDndSource(completion.sourceId);
    onComplete(completion.canceled);
  };
  return (
    <WorkspaceSectionDndContext.Provider value={context}>
      <UpstreamDndBoundary
        manageAccessibility={false}
        onComplete={handleComplete}
        onStart={handleStart}
        overlayClassName="setta-workspace__section-drag-overlay"
        overlayLabel={(id) => {
          const source = workspaceSectionDndSource(id);
          const activeMode = activeSectionMode ?? mode;
          return `${activeMode === "sort" ? "Sorting" : "Moving"} ${sectionTitle(source.sectionId)}`;
        }}
      >
        {children}
      </UpstreamDndBoundary>
    </WorkspaceSectionDndContext.Provider>
  );
}

export function useWorkspaceSectionDnd({
  blocked,
  depth,
  sectionId,
  spatialMoving,
}: Readonly<{
  blocked: boolean;
  depth: number;
  sectionId: string;
  spatialMoving: boolean;
}>) {
  const context = useContext(WorkspaceSectionDndContext);
  const resolvedContext = context ?? DISABLED_SECTION_DND_CONTEXT;
  const structural = sectionUsesStructuralDrag(resolvedContext, depth, sectionId);
  const enabled = sectionStructuralDragEnabled(resolvedContext, blocked, sectionId, structural);
  const draggable = useUpstreamDndDraggable({
    data: { kind: "section", sectionId },
    disabled: !enabled,
    id: sourceId(sectionId, depth === 0),
  });
  if (!context) {
    throw new Error("Workspace section dragging requires its workbench interaction boundary.");
  }
  return {
    active: draggable.active,
    elementRef: draggable.elementRef,
    enabled,
    handleRef: draggable.handleRef,
    mode: sectionStructuralDragMode(context, sectionId),
    spatialEnabled: context.activationEnabled || (context.rootLayoutActive && spatialMoving),
    structural,
  };
}
