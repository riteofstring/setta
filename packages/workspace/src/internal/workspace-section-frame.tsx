import {
  useCallback,
  useId,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { WorkspaceSection } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { WorkspaceKeyboardMoveDirection } from "./workspace-root-movement.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

export type WorkspaceSectionFrameProps = Readonly<{
  appearance: "dark" | "light";
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  order: number;
  readOnly: boolean;
  selected: boolean;
  selectionMovementBlocked: boolean;
  section: WorkspaceSection<unknown>;
}>;

function SectionStateLabels({
  isMinimized,
  locked,
}: Readonly<{ isMinimized: boolean; locked: boolean }>) {
  return (
    <>
      {locked ? <span className="setta-workspace__section-state">Locked</span> : null}
      {isMinimized ? <span className="setta-workspace__section-state">Minimized</span> : null}
    </>
  );
}

type SectionHeadingProps = Readonly<{
  controls: ReactNode;
  definition: ResolvedSectionDefinition<unknown>;
  hasStatus: boolean;
  headingId: string;
  section: WorkspaceSection<unknown>;
  selectionControl: ReactNode;
  showHeader: boolean;
  statusId: string;
}>;

function VisibleSectionHeading({
  controls,
  definition,
  hasStatus,
  headingId,
  section,
  selectionControl,
  statusId,
}: Omit<SectionHeadingProps, "showHeader">) {
  return (
    <header className="setta-workspace__section-header">
      <div className="setta-workspace__section-heading">
        <h2 id={headingId}>{section.title}</h2>
        <span className="setta-workspace__section-kind">{definition.displayName}</span>
      </div>
      <div className="setta-workspace__section-actions">
        {selectionControl}
        {hasStatus ? (
          <div className="setta-workspace__section-states" id={statusId}>
            <SectionStateLabels
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
            />
          </div>
        ) : null}
        {controls}
      </div>
    </header>
  );
}

function HeaderlessSectionHeading({
  controls,
  hasStatus,
  headingId,
  section,
  selectionControl,
  statusId,
}: Omit<SectionHeadingProps, "definition" | "showHeader">) {
  return (
    <>
      <h2 className="setta-workspace__visually-hidden" id={headingId}>
        {section.title}
      </h2>
      <div className="setta-workspace__section-actions setta-workspace__section-actions--floating">
        {selectionControl}
        {hasStatus ? (
          <div className="setta-workspace__section-states" id={statusId}>
            <SectionStateLabels
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
            />
          </div>
        ) : null}
        {controls}
      </div>
    </>
  );
}

function SectionHeading(props: SectionHeadingProps) {
  if (props.showHeader) {
    return <VisibleSectionHeading {...props} />;
  }
  return <HeaderlessSectionHeading {...props} />;
}

function moveDirection(key: string): WorkspaceKeyboardMoveDirection | null {
  if (key === "ArrowDown") {
    return "down";
  }
  if (key === "ArrowLeft") {
    return "left";
  }
  if (key === "ArrowRight") {
    return "right";
  }
  return key === "ArrowUp" ? "up" : null;
}

function MoveIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="M10 2.75v14.5M2.75 10h14.5M7.5 5.25 10 2.75l2.5 2.5M7.5 14.75l2.5 2.5 2.5-2.5M5.25 7.5 2.75 10l2.5 2.5M14.75 7.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

function SelectionIcon({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="M7 3.5H4.5a1 1 0 0 0-1 1V7M13 3.5h2.5a1 1 0 0 1 1 1V7M7 16.5H4.5a1 1 0 0 1-1-1V13M13 16.5h2.5a1 1 0 0 0 1-1V13" />
      <path
        className="setta-workspace__section-selection-check"
        d="m6.75 10 2.1 2.1 4.4-4.45"
        data-selected={String(selected)}
      />
    </svg>
  );
}

function SectionSelectionControl({
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

function SectionDragHandle({
  descriptionId,
  layoutEditable,
  onKeyboardMove,
  onSelectionRequest,
  section,
  selected,
  selectionMovementBlocked,
}: Readonly<{
  descriptionId: string;
  layoutEditable: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
  selectionMovementBlocked: boolean;
}>) {
  const disabled = !layoutEditable || section.positionAndSizeLocked || selectionMovementBlocked;
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = moveDirection(event.key);
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
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  };
  return (
    <button
      aria-describedby={descriptionId}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      aria-label={`Move ${section.title}`}
      className="setta-workspace__section-drag-handle"
      disabled={disabled}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      type="button"
    >
      <MoveIcon />
    </button>
  );
}

function SectionContent({
  appearance,
  definition,
  readOnly,
  section,
}: Pick<WorkspaceSectionFrameProps, "appearance" | "definition" | "readOnly" | "section">) {
  if (section.isMinimized) {
    return null;
  }
  const Renderer = definition.render;
  return (
    <div
      className={`setta-workspace__section-content setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-prevent-pan="true"
      data-workspace-prevent-wheel="true"
    >
      <Renderer
        appearance={appearance}
        data={section.data}
        readOnly={readOnly}
        sectionId={section.id}
      />
    </div>
  );
}

function registerSectionFrame(
  element: HTMLElement | null,
  geometry: WorkspaceGeometryMeasurements,
  order: number,
  sectionId: string,
) {
  if (!element) {
    return;
  }
  return geometry.register({
    depth: 0,
    element,
    order,
    parentSectionId: null,
    sectionId,
  });
}

export function WorkspaceSectionFrame({
  appearance,
  definition,
  geometry,
  layoutEditable,
  moving,
  onKeyboardMove,
  onSelectionRequest,
  order,
  readOnly,
  selected,
  selectionMovementBlocked,
  section,
}: WorkspaceSectionFrameProps) {
  const reactId = useId().replaceAll(":", "");
  const headingId = `setta-workspace-section-${reactId}-title`;
  const moveDescriptionId = `setta-workspace-section-${reactId}-move-description`;
  const statusId = `setta-workspace-section-${reactId}-status`;
  const hasStatus = section.positionAndSizeLocked || section.isMinimized;
  const showHeader = section.presentation.chrome !== "none" || section.isMinimized;
  const registerElement = useCallback(
    (element: HTMLElement | null) => registerSectionFrame(element, geometry, order, section.id),
    [geometry, order, section.id],
  );
  const dragHandle = (
    <SectionDragHandle
      descriptionId={moveDescriptionId}
      layoutEditable={layoutEditable}
      onKeyboardMove={onKeyboardMove}
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
      selectionMovementBlocked={selectionMovementBlocked}
    />
  );
  const selectionControl = (
    <SectionSelectionControl
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
    />
  );

  return (
    <article
      aria-describedby={hasStatus ? statusId : undefined}
      aria-labelledby={headingId}
      className="setta-workspace__root-shell setta-workspace__section-frame"
      data-workspace-chrome={section.presentation.chrome}
      data-workspace-minimized={String(section.isMinimized)}
      data-workspace-moving={String(moving)}
      data-workspace-read-only={String(readOnly)}
      data-workspace-selected={String(selected)}
      data-workspace-section-id={section.id}
      ref={registerElement}
      tabIndex={-1}
    >
      <span className="setta-workspace__visually-hidden" id={moveDescriptionId}>
        Drag to move. Use the arrow keys for keyboard movement.
      </span>
      <SectionHeading
        controls={dragHandle}
        definition={definition}
        hasStatus={hasStatus}
        headingId={headingId}
        section={section}
        selectionControl={selectionControl}
        showHeader={showHeader}
        statusId={statusId}
      />
      <SectionContent
        appearance={appearance}
        definition={definition}
        readOnly={readOnly}
        section={section}
      />
    </article>
  );
}
