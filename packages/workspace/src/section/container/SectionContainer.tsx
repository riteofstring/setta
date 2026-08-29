import _ from "lodash";
import React from "react";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import {
  canWorkspaceSectionOwnNestedSections,
  getRegisteredSectionKindOrThrow,
  type SectionKindDefinition,
} from "../../document/sectionKindRegistry";
import { useActiveSections, useWorkspaceDocument } from "../../document/stores";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getOutlineColor } from "../sectionColors";
import type { SectionDragListeners } from "./ContainerCore";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function SectionContainerComponent({
  sectionId,
  isTopLevel = false,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel?: boolean;
  dragListeners?: SectionDragListeners;
}) {
  const host = useWorkspaceHost();
  const isGroup = useWorkspaceDocument((x) =>
    isGroupSection(getSectionOrThrow(x, sectionId)),
  );
  const canOwnNestedSections = useWorkspaceDocument((x) =>
    canWorkspaceSectionOwnNestedSections(host, getSectionOrThrow(x, sectionId)),
  );
  const sectionKind = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).kind,
  );
  const definition = isGroup
    ? null
    : getRegisteredSectionKindOrThrow(host, sectionKind);
  const renderAttachedContent =
    definition !== null && definition.presentation === undefined
      ? definition.renderAttachedContent
      : undefined;

  return (
    <ContainerSwitch
      isGroup={isGroup}
      sectionId={sectionId}
      dragListeners={dragListeners}
      isTopLevel={isTopLevel}
    >
      {isGroup ? (
        <MaybeManyNestedSections isGroup sectionId={sectionId} />
      ) : renderAttachedContent ? (
        <>
          <RegisteredAttachmentGroup
            renderAttachedContent={renderAttachedContent}
            sectionId={sectionId}
          />
          {canOwnNestedSections ? (
            <MaybeManyNestedSections isGroup={false} sectionId={sectionId} />
          ) : null}
        </>
      ) : (
        <>
          <SectionContainerCore sectionId={sectionId} />
          {canOwnNestedSections ? (
            <MaybeManyNestedSections isGroup={false} sectionId={sectionId} />
          ) : null}
        </>
      )}
    </ContainerSwitch>
  );
}

export const SectionContainer = React.memo(SectionContainerComponent, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);

function RegisteredAttachmentGroup({
  renderAttachedContent,
  sectionId,
}: {
  renderAttachedContent: NonNullable<
    Extract<
      SectionKindDefinition,
      { presentation?: undefined }
    >["renderAttachedContent"]
  >;
  sectionId: string;
}) {
  const section = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId));
  const isActiveSection = useActiveSections((x) =>
    x.activeIds.includes(sectionId),
  );
  const cornerClassName = section.positionAndSizeLocked
    ? "rounded-sm"
    : "rounded-lg";

  return (
    <div
      className={`setta-workspace-joined-section-group transition-radius relative flex w-min flex-col ${cornerClassName} outline outline-4 ${getOutlineColor({ isActiveSection })}`}
      data-workspace-joined-section-group
    >
      <SectionContainerCore sectionId={sectionId} />
      {renderAttachedContent(section)}
    </div>
  );
}
