import { useCallback, useId } from "react";

import type { WorkspaceSection } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";

export type WorkspaceSectionFrameProps = Readonly<{
  appearance: "dark" | "light";
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
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
  definition: ResolvedSectionDefinition<unknown>;
  hasStatus: boolean;
  headingId: string;
  section: WorkspaceSection<unknown>;
  showHeader: boolean;
  statusId: string;
}>;

function VisibleSectionHeading({
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
      {hasStatus ? (
        <div className="setta-workspace__section-states" id={statusId}>
          <SectionStateLabels
            isMinimized={section.isMinimized}
            locked={section.positionAndSizeLocked}
          />
        </div>
      ) : null}
    </header>
  );
}

function HeaderlessSectionHeading({
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
      {hasStatus ? (
        <div
          className="setta-workspace__section-states setta-workspace__section-states--floating"
          id={statusId}
        >
          <SectionStateLabels
            isMinimized={section.isMinimized}
            locked={section.positionAndSizeLocked}
          />
        </div>
      ) : null}
    </>
  );
}

function SectionHeading(props: SectionHeadingProps) {
  if (props.showHeader) {
    return <VisibleSectionHeading {...props} />;
  }
  return <HeaderlessSectionHeading {...props} />;
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
  order,
  readOnly,
  section,
}: WorkspaceSectionFrameProps) {
  const reactId = useId().replaceAll(":", "");
  const headingId = `setta-workspace-section-${reactId}-title`;
  const statusId = `setta-workspace-section-${reactId}-status`;
  const hasStatus = section.positionAndSizeLocked || section.isMinimized;
  const showHeader = section.presentation.chrome !== "none" || section.isMinimized;
  const registerElement = useCallback(
    (element: HTMLElement | null) => registerSectionFrame(element, geometry, order, section.id),
    [geometry, order, section.id],
  );

  return (
    <article
      aria-describedby={hasStatus ? statusId : undefined}
      aria-labelledby={headingId}
      className="setta-workspace__root-shell setta-workspace__section-frame"
      data-workspace-chrome={section.presentation.chrome}
      data-workspace-minimized={String(section.isMinimized)}
      data-workspace-read-only={String(readOnly)}
      data-workspace-section-id={section.id}
      ref={registerElement}
      tabIndex={-1}
    >
      <SectionHeading
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
