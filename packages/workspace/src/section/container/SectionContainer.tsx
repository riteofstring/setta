import React from "react";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors.js";
import { isWorkspaceSectionVisible } from "../../document/savedViewDisplay.js";
import {
  canWorkspaceSectionOwnNestedSections,
  getRegisteredSectionKindOrThrow,
  type SectionKindDefinition,
} from "../../document/sectionKindRegistry.js";
import {
  useActiveSections,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "../../document/stores.js";
import { useWorkspaceSavedViewEditing } from "../../saved-views/editingState.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import { getOutlineColor } from "../sectionColors.js";
import type { SectionDragListeners } from "./ContainerCore.js";
import { ContainerSwitch } from "./ContainerSwitch.js";
import { MaybeManyNestedSections } from "./ManyNestedSections.js";
import { SectionContainerCore } from "./SectionContainerCore.js";
import { deepEqual } from "../../state/deepEqual.js";

type SectionAttachedContentRenderer = NonNullable<
  Extract<
    SectionKindDefinition,
    { presentation?: undefined }
  >["renderAttachedContent"]
>;

type SectionVisibilityPresentation =
  "hidden-by-ancestor" | "hidden-directly" | "visible";

function getSectionVisibilityPresentation(
  state: WorkspaceDocumentState,
  sectionId: string,
): SectionVisibilityPresentation {
  if (isWorkspaceSectionVisible(state, sectionId)) {
    return "visible";
  }
  const parentId = state.parentSectionMap[sectionId] ?? null;
  return parentId === null || isWorkspaceSectionVisible(state, parentId)
    ? "hidden-directly"
    : "hidden-by-ancestor";
}

function getSectionAttachedContentRenderer({
  host,
  isGroup,
  sectionKind,
}: {
  host: WorkspaceHost;
  isGroup: boolean;
  sectionKind: string;
}): SectionAttachedContentRenderer | undefined {
  if (isGroup) {
    return undefined;
  }
  const definition = getRegisteredSectionKindOrThrow(host, sectionKind);
  return definition.presentation === undefined
    ? definition.renderAttachedContent
    : undefined;
}

function SectionContainerComponent({
  sectionId,
  isTopLevel,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: SectionDragListeners;
}) {
  const host = useWorkspaceHost();
  const editingSavedView = useWorkspaceSavedViewEditing();
  const visibilityPresentation = useWorkspaceDocument((state) =>
    getSectionVisibilityPresentation(state, sectionId),
  );
  const isGroup = useWorkspaceDocument((x) =>
    isGroupSection(getSectionOrThrow(x, sectionId)),
  );
  const canOwnNestedSections = useWorkspaceDocument((x) =>
    canWorkspaceSectionOwnNestedSections(host, getSectionOrThrow(x, sectionId)),
  );
  const sectionKind = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).kind,
  );
  const isCanonicalTopLevel = useWorkspaceDocument((x) =>
    Object.hasOwn(x.topLevelSections, sectionId),
  );
  const renderAttachedContent = getSectionAttachedContentRenderer({
    host,
    isGroup,
    sectionKind,
  });

  const showHidden = editingSavedView && visibilityPresentation !== "visible";
  if (visibilityPresentation !== "visible" && !showHidden) {
    return null;
  }
  if (isTopLevel !== isCanonicalTopLevel) {
    return null;
  }

  return (
    <ContainerSwitch
      isGroup={isGroup}
      sectionId={sectionId}
      dragListeners={dragListeners}
      isTopLevel={isTopLevel}
      dimmed={showHidden && visibilityPresentation === "hidden-directly"}
    >
      <SectionContainerContents
        canOwnNestedSections={canOwnNestedSections}
        isGroup={isGroup}
        renderAttachedContent={renderAttachedContent}
        sectionId={sectionId}
      />
    </ContainerSwitch>
  );
}

export const SectionContainer = React.memo(SectionContainerComponent, (p, n) =>
  deepEqual(p.dragListeners, n.dragListeners),
);

export function renderNestedSectionContainer(
  sectionId: string,
  dragListeners: SectionDragListeners,
) {
  return (
    <SectionContainer
      dragListeners={dragListeners}
      isTopLevel={false}
      sectionId={sectionId}
    />
  );
}

function SectionContainerContents({
  canOwnNestedSections,
  isGroup,
  renderAttachedContent,
  sectionId,
}: {
  canOwnNestedSections: boolean;
  isGroup: boolean;
  renderAttachedContent: SectionAttachedContentRenderer | undefined;
  sectionId: string;
}) {
  if (isGroup) {
    return (
      <MaybeManyNestedSections
        isGroup
        renderSection={renderNestedSectionContainer}
        sectionId={sectionId}
      />
    );
  }
  const nestedSections = canOwnNestedSections ? (
    <MaybeManyNestedSections
      isGroup={false}
      renderSection={renderNestedSectionContainer}
      sectionId={sectionId}
    />
  ) : null;
  if (renderAttachedContent) {
    return (
      <>
        <RegisteredAttachmentGroup
          renderAttachedContent={renderAttachedContent}
          sectionId={sectionId}
        />
        {nestedSections}
      </>
    );
  }
  return (
    <>
      <SectionContainerCore sectionId={sectionId} />
      {nestedSections}
    </>
  );
}

function RegisteredAttachmentGroup({
  renderAttachedContent,
  sectionId,
}: {
  renderAttachedContent: SectionAttachedContentRenderer;
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
