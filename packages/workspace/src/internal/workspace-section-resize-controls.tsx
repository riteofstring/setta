import { NodeResizeControl } from "@xyflow/react";
import { useId, type KeyboardEvent, type MouseEvent } from "react";

import type { WorkspaceSection } from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import { useWorkspaceSectionDetached } from "./workspace-section-detachment.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";
import {
  workspaceSectionResizeBounds,
  workspaceSectionResizeHandles,
  type WorkspaceRootResizeSnapshot,
  type WorkspaceSectionInlineEnd,
  type WorkspaceSectionResizeHandle,
} from "./workspace-section-sizing.js";

export type WorkspaceSectionResizeBindings = Readonly<{
  onContentSizeRequest(sectionId: string, handle: WorkspaceSectionResizeHandle): void;
  onKeyboardResize(
    sectionId: string,
    handle: WorkspaceSectionResizeHandle,
    inlineEnd: WorkspaceSectionInlineEnd,
    key: string,
  ): void;
  onPointerResize(
    sectionId: string,
    handle: WorkspaceSectionResizeHandle,
    resize: WorkspaceRootResizeSnapshot,
  ): void;
  onPointerResizeEnd(
    sectionId: string,
    handle: WorkspaceSectionResizeHandle,
    resize: WorkspaceRootResizeSnapshot,
  ): void;
}>;

type PhysicalResizeControl = Readonly<{
  handle: WorkspaceSectionResizeHandle;
  inlineEnd: WorkspaceSectionInlineEnd;
  position: "bottom" | "bottom-left" | "bottom-right" | "left" | "right";
}>;

const resizeControls: readonly PhysicalResizeControl[] = [
  { handle: "inline-end", inlineEnd: "right", position: "right" },
  { handle: "inline-end", inlineEnd: "left", position: "left" },
  { handle: "block-end", inlineEnd: "right", position: "bottom" },
  { handle: "corner", inlineEnd: "right", position: "bottom-right" },
  { handle: "corner", inlineEnd: "left", position: "bottom-left" },
];

function controlLabel(title: string, handle: WorkspaceSectionResizeHandle): string {
  if (handle === "inline-end") {
    return `Resize ${title} width`;
  }
  if (handle === "block-end") {
    return `Resize ${title} height`;
  }
  return `Resize ${title} width and height`;
}

function keyboardKeyApplies(handle: WorkspaceSectionResizeHandle, key: string): boolean {
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const vertical = key === "ArrowDown" || key === "ArrowUp";
  return (
    (horizontal && handle !== "block-end") ||
    (vertical && handle !== "inline-end") ||
    key === "Enter" ||
    key === " "
  );
}

function keyboardShortcuts(handle: WorkspaceSectionResizeHandle): string {
  if (handle === "inline-end") {
    return "ArrowLeft ArrowRight Enter Space";
  }
  if (handle === "block-end") {
    return "ArrowUp ArrowDown Enter Space";
  }
  return "ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space";
}

function resizeSnapshot(params: Readonly<{ height: number; width: number; x: number; y: number }>) {
  return {
    position: { x: params.x, y: params.y },
    size: { height: params.height, width: params.width },
  } as const;
}

function resizeDirection(
  definition: ResolvedSectionDefinition<unknown>,
  handle: WorkspaceSectionResizeHandle,
): "horizontal" | "vertical" | undefined {
  if (definition.resize.preserveAspectRatio || handle === "corner") {
    return undefined;
  }
  return handle === "inline-end" ? "horizontal" : "vertical";
}

function ResizeButton({
  bindings,
  control,
  descriptionId,
  section,
}: Readonly<{
  bindings: WorkspaceSectionResizeBindings;
  control: PhysicalResizeControl;
  descriptionId: string;
  section: WorkspaceSection<unknown>;
}>) {
  const handleKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!keyboardKeyApplies(control.handle, event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter" || event.key === " ") {
      bindings.onContentSizeRequest(section.id, control.handle);
      return;
    }
    bindings.onKeyboardResize(section.id, control.handle, control.inlineEnd, event.key);
  };
  const stopNodeClick = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();
  return (
    <button
      aria-describedby={descriptionId}
      aria-keyshortcuts={keyboardShortcuts(control.handle)}
      aria-label={controlLabel(section.title, control.handle)}
      className="setta-workspace__section-resize-button"
      data-workspace-resize-edge={control.position}
      data-workspace-resize-handle={control.handle}
      onClick={stopNodeClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        bindings.onContentSizeRequest(section.id, control.handle);
      }}
      onKeyDown={handleKeyboard}
      type="button"
    >
      <span aria-hidden="true" className="setta-workspace__section-resize-grip" />
    </button>
  );
}

function classNameFor(control: PhysicalResizeControl): string {
  return [
    "setta-workspace__section-resize-control",
    WORKSPACE_NO_PAN_CLASS_NAME,
    WORKSPACE_NO_WHEEL_CLASS_NAME,
    `setta-workspace__section-resize-control--${control.handle}`,
    `setta-workspace__section-resize-control--${control.position}`,
  ].join(" ");
}

export function WorkspaceSectionResizeControls({
  bindings,
  definition,
  layoutEditable,
  section,
  selected,
}: Readonly<{
  bindings: WorkspaceSectionResizeBindings;
  definition: ResolvedSectionDefinition<unknown>;
  layoutEditable: boolean;
  section: WorkspaceSection<unknown>;
  selected: boolean;
}>) {
  const descriptionId = `setta-workspace-resize-${useId().replaceAll(":", "")}`;
  const detached = useWorkspaceSectionDetached(section.id);
  const handles = workspaceSectionResizeHandles(definition);
  const visible =
    selected &&
    layoutEditable &&
    !detached &&
    !section.isMinimized &&
    !section.positionAndSizeLocked &&
    handles.length > 0;
  if (!visible) {
    return null;
  }
  const bounds = workspaceSectionResizeBounds(definition);
  return (
    <>
      <span className="setta-workspace__visually-hidden" id={descriptionId}>
        Drag to resize. Use the arrow keys for keyboard resizing. Double-click or press Enter or
        Space to fit supported dimensions to content.
      </span>
      {resizeControls
        .filter(({ handle }) => handles.includes(handle))
        .map((control) => {
          const direction = resizeDirection(definition, control.handle);
          return (
            <NodeResizeControl
              {...(direction ? { resizeDirection: direction } : {})}
              autoScale
              className={classNameFor(control)}
              keepAspectRatio={definition.resize.preserveAspectRatio}
              key={control.position}
              maxHeight={bounds.maxHeight}
              maxWidth={bounds.maxWidth}
              minHeight={bounds.minHeight}
              minWidth={bounds.minWidth}
              onResize={(_event, params) =>
                bindings.onPointerResize(section.id, control.handle, resizeSnapshot(params))
              }
              onResizeEnd={(_event, params) =>
                bindings.onPointerResizeEnd(section.id, control.handle, resizeSnapshot(params))
              }
              position={control.position}
            >
              <ResizeButton
                bindings={bindings}
                control={control}
                descriptionId={descriptionId}
                section={section}
              />
            </NodeResizeControl>
          );
        })}
    </>
  );
}
