import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

import type {
  SectionOrientation,
  WorkspaceActionResult,
  WorkspaceDocument,
  WorkspaceSection,
} from "../core.js";
import { workspaceSectionOrientationRequiresMeasurement } from "./workspace-section-orientation-command.js";

type PendingOrientation = Readonly<{
  orientation: SectionOrientation;
  sectionId: string;
  title: string;
}>;

function orientationAdverb(orientation: SectionOrientation): "horizontally" | "vertically" {
  return orientation === "horizontal" ? "horizontally" : "vertically";
}

function oppositeOrientation(orientation: SectionOrientation): SectionOrientation {
  return orientation === "horizontal" ? "vertical" : "horizontal";
}

function orientationAnnouncement(action: PendingOrientation, accepted: boolean): string {
  if (accepted) {
    return `${action.title} child sections are arranged ${orientationAdverb(action.orientation)}.`;
  }
  return `${action.title} child sections remain arranged ${orientationAdverb(oppositeOrientation(action.orientation))} because the host did not accept the change.`;
}

function rejectedOrientationAnnouncement(action: PendingOrientation, reason: string): string {
  if (reason === "layout-edit-disabled") {
    return `Unable to change ${action.title} child orientation. Turn on layout editing and try again.`;
  }
  if (reason === "section-locked") {
    return `${action.title} is locked. Unlock it to change child orientation.`;
  }
  if (reason === "section-minimized") {
    return `Expand ${action.title} before changing child orientation.`;
  }
  if (reason === "section-geometry-unavailable") {
    return `${action.title} must be measured before its child orientation can change.`;
  }
  return `Unable to change ${action.title} child orientation.`;
}

export function useWorkspaceSectionOrientationActions<TSectionData>({
  document,
  onCommit,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  onCommit(sectionId: string, orientation: SectionOrientation): WorkspaceActionResult;
}>) {
  const documentRef = useRef(document);
  const onCommitRef = useRef(onCommit);
  documentRef.current = document;
  onCommitRef.current = onCommit;
  const pendingRef = useRef<PendingOrientation | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [synchronizationRevision, setSynchronizationRevision] = useState(0);

  const handleCommit = useCallback((sectionId: string, orientation: SectionOrientation) => {
    const section = documentRef.current.sections[sectionId];
    if (!section?.childLayout || section.childLayout.positioning !== "ordered") {
      throw new Error(`Workspace orientation action is missing container ${sectionId}.`);
    }
    const action = { orientation, sectionId, title: section.title } as const;
    const result = onCommitRef.current(sectionId, orientation);
    pendingRef.current = result.status === "applied" ? action : null;
    if (result.status !== "applied") {
      setAnnouncementText(
        "reason" in result
          ? rejectedOrientationAnnouncement(action, result.reason)
          : `${action.title} child sections are already arranged ${orientationAdverb(action.orientation)}.`,
      );
    }
    setSynchronizationRevision((revision) => revision + 1);
    return result;
  }, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    const childLayout = document.sections[pending.sectionId]?.childLayout;
    const accepted =
      childLayout?.positioning === "ordered" && childLayout.orientation === pending.orientation;
    setAnnouncementText(orientationAnnouncement(pending, accepted));
    pendingRef.current = null;
  }, [document.sections, synchronizationRevision]);

  return { announcementText, handleCommit };
}

// Both orientation-icon variants are module constants so the frame rerenders
// that accompany every selection commit bail out of the SVG subtree.
function orientationIcon(horizontal: boolean) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      {horizontal ? (
        <>
          <rect height="8" rx="1.5" width="4" x="2.5" y="6" />
          <rect height="8" rx="1.5" width="4" x="8" y="6" />
          <rect height="8" rx="1.5" width="4" x="13.5" y="6" />
        </>
      ) : (
        <>
          <rect height="3" rx="1.5" width="11" x="4.5" y="3" />
          <rect height="3" rx="1.5" width="11" x="4.5" y="8.5" />
          <rect height="3" rx="1.5" width="11" x="4.5" y="14" />
        </>
      )}
    </svg>
  );
}

const horizontalOrientationIcon = orientationIcon(true);
const verticalOrientationIcon = orientationIcon(false);

function OrientationIcon({ orientation }: Readonly<{ orientation: SectionOrientation }>) {
  return orientation === "horizontal" ? horizontalOrientationIcon : verticalOrientationIcon;
}

export function WorkspaceSectionOrientationControl({
  controlRef,
  layoutEditable,
  onCommit,
  section,
}: Readonly<{
  controlRef: RefObject<HTMLButtonElement | null>;
  layoutEditable: boolean;
  onCommit(sectionId: string, orientation: SectionOrientation): WorkspaceActionResult;
  section: WorkspaceSection<unknown>;
}>) {
  const childLayout = section.childLayout;
  if (!childLayout || childLayout.positioning !== "ordered") {
    return null;
  }
  const nextOrientation = oppositeOrientation(childLayout.orientation);
  const measurementBlocked =
    workspaceSectionOrientationRequiresMeasurement(section, nextOrientation) &&
    (section.positionAndSizeLocked || section.isMinimized);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onCommit(section.id, nextOrientation);
  };
  return (
    <button
      aria-label={`Arrange ${section.title} child sections ${orientationAdverb(nextOrientation)}`}
      className="setta-workspace__section-edit-control setta-workspace__section-orientation-control"
      data-workspace-next-orientation={nextOrientation}
      data-workspace-section-layout-control="orientation"
      disabled={!layoutEditable || measurementBlocked}
      onClick={handleClick}
      ref={controlRef}
      type="button"
    >
      <OrientationIcon orientation={nextOrientation} />
    </button>
  );
}
