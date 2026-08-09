import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

import type { WorkspaceSection } from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  workspaceKeyboardMoveDirectionForKey,
  type WorkspaceKeyboardMoveDirection,
} from "./workspace-root-movement.js";
import { useWorkspaceSectionDragHandleActivation } from "./workspace-section-dnd.js";
import { MoveIcon, SelectionIcon } from "./workspace-section-frame-icons.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

export function SectionSelectionControl({
  onSelectionRequest,
  section,
  selected,
}: Readonly<{
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
}>) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: false,
    });
  };
  return (
    <button
      aria-keyshortcuts="Shift+Enter Shift+Space"
      aria-label={`Select ${section.title}`}
      aria-pressed={selected}
      className="setta-workspace__section-selection-control"
      data-workspace-selection-control=""
      onClick={handleClick}
      type="button"
    >
      <SelectionIcon selected={selected} />
    </button>
  );
}

function structuralDragAttribute<Value>(structural: boolean, value: Value): Value | undefined {
  return structural ? value : undefined;
}

function spatialDragDisabled(
  depth: number,
  detached: boolean,
  layoutEditable: boolean,
  section: WorkspaceSection<unknown>,
  selectionMovementBlocked: boolean,
  spatialEnabled: boolean,
): boolean {
  return (
    !spatialEnabled ||
    detached ||
    depth > 0 ||
    !layoutEditable ||
    section.positionAndSizeLocked ||
    selectionMovementBlocked
  );
}

function handleStructuralDragKey(
  event: KeyboardEvent<HTMLButtonElement>,
  active: boolean,
  disabled: boolean,
  section: WorkspaceSection<unknown>,
  selected: boolean,
  onSelectionRequest: (sectionId: string, request: WorkspaceSectionSelectionRequest) => void,
): void {
  if (active && workspaceKeyboardMoveDirectionForKey(event.key)) {
    event.preventDefault();
    event.stopPropagation();
  }
  if ((event.key === "Enter" || event.key === " ") && !disabled) {
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  }
}

export function SectionDragHandle({
  depth,
  descriptionId,
  detached,
  layoutEditable,
  onKeyboardMove,
  onSelectionRequest,
  section,
  selected,
  selectionMovementBlocked,
  spatialMoving,
  structuralDrag,
}: Readonly<{
  depth: number;
  descriptionId: string;
  detached: boolean;
  layoutEditable: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
  selectionMovementBlocked: boolean;
  spatialMoving: boolean;
  structuralDrag: Readonly<{
    active: boolean;
    configEnabled: boolean;
    handleRef(element: Element | null): void;
    mode: "free" | "sort";
    structural: boolean;
  }>;
}>) {
  const activation = useWorkspaceSectionDragHandleActivation({
    configEnabled: structuralDrag.configEnabled,
    sectionId: section.id,
    spatialMoving,
  });
  const disabled = structuralDrag.structural
    ? !activation.structuralEnabled
    : spatialDragDisabled(
        depth,
        detached,
        layoutEditable,
        section,
        selectionMovementBlocked,
        activation.spatialEnabled,
      );
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (structuralDrag.structural) {
      handleStructuralDragKey(
        event,
        structuralDrag.active,
        disabled,
        section,
        selected,
        onSelectionRequest,
      );
      return;
    }
    const direction = workspaceKeyboardMoveDirectionForKey(event.key);
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onKeyboardMove(section.id, direction);
  };
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || disabled) {
      return;
    }
    if (structuralDrag.structural && event.pointerType === "touch") {
      return;
    }
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  };
  return (
    <button
      aria-describedby={descriptionId}
      aria-grabbed={structuralDragAttribute(structuralDrag.structural, structuralDrag.active)}
      aria-keyshortcuts={
        structuralDrag.structural
          ? "Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Escape"
          : "ArrowUp ArrowDown ArrowLeft ArrowRight"
      }
      aria-label={`Move ${section.title}`}
      aria-roledescription={structuralDragAttribute(structuralDrag.structural, "draggable")}
      className={`setta-workspace__section-drag-handle${depth === 0 && !detached ? " setta-workspace__section-drag-handle--root" : ""}${structuralDrag.structural ? ` ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}` : ""}`}
      data-workspace-section-drag-mode={structuralDrag.structural ? structuralDrag.mode : "spatial"}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      ref={structuralDragAttribute(structuralDrag.structural, structuralDrag.handleRef)}
      type="button"
    >
      <MoveIcon />
    </button>
  );
}
