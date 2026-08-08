import { useCallback, useId, type KeyboardEvent, type ReactNode } from "react";

import type { WorkspaceSection } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { WorkspaceKeyboardMoveDirection } from "./workspace-root-movement.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";

export type WorkspaceSectionFrameProps = Readonly<{
  appearance: "dark" | "light";
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  order: number;
  readOnly: boolean;
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
  showHeader: boolean;
  statusId: string;
}>;

function VisibleSectionHeading({
  controls,
  definition,
  hasStatus,
  headingId,
  section,
  statusId,
}: Omit<SectionHeadingProps, "showHeader">) {
  return (
    <header className="setta-workspace__section-header">
      <div className="setta-workspace__section-heading">
        <h2 id={headingId}>{section.title}</h2>
        <span className="setta-workspace__section-kind">{definition.displayName}</span>
      </div>
      <div className="setta-workspace__section-actions">
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
  statusId,
}: Omit<SectionHeadingProps, "definition" | "showHeader">) {
  return (
    <>
      <h2 className="setta-workspace__visually-hidden" id={headingId}>
        {section.title}
      </h2>
      <div className="setta-workspace__section-actions setta-workspace__section-actions--floating">
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

function SectionDragHandle({
  descriptionId,
  layoutEditable,
  onKeyboardMove,
  section,
}: Readonly<{
  descriptionId: string;
  layoutEditable: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  section: WorkspaceSection<unknown>;
}>) {
  const disabled = !layoutEditable || section.positionAndSizeLocked;
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = moveDirection(event.key);
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onKeyboardMove(section.id, direction);
  };
  return (
    <button
      aria-describedby={descriptionId}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      aria-label={`Move ${section.title}`}
      className="setta-workspace__section-drag-handle"
      disabled={disabled}
      onKeyDown={handleKeyDown}
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
  order,
  readOnly,
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
      section={section}
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
