import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

import type {
  SectionOverflow,
  WorkspaceActionResult,
  WorkspaceDocument,
  WorkspaceSection,
} from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";

type WorkspaceSectionOverflowCommit = (
  sectionId: string,
  overflow: SectionOverflow,
  measuredSize: Readonly<{ height: number; width: number }> | null,
) => WorkspaceActionResult;

type PendingOverflow = Readonly<{
  overflow: SectionOverflow;
  sectionId: string;
  title: string;
}>;

function overflowState(overflow: SectionOverflow): string {
  return overflow === "scroll" ? "scrolling its child sections" : "growing with its child sections";
}

function overflowAnnouncement(action: PendingOverflow, accepted: boolean): string {
  if (accepted) {
    return `${action.title} is ${overflowState(action.overflow)}.`;
  }
  const retained = action.overflow === "scroll" ? "grow" : "scroll";
  return `${action.title} remains ${overflowState(retained)} because the host did not accept the change.`;
}

function rejectedOverflowAnnouncement(action: PendingOverflow, reason: string): string {
  if (reason === "layout-edit-disabled") {
    return `Unable to change ${action.title} child overflow. Turn on layout editing and try again.`;
  }
  if (reason === "section-locked") {
    return `${action.title} is locked. Unlock it to change child overflow.`;
  }
  if (reason === "section-minimized") {
    return `Expand ${action.title} before changing child overflow.`;
  }
  if (reason === "section-geometry-unavailable") {
    return `${action.title} must be measured before child scrolling can be enabled.`;
  }
  return `Unable to change ${action.title} child overflow.`;
}

function measuredSizeForOverflow(
  section: WorkspaceSection<unknown>,
  overflow: SectionOverflow,
  geometry: WorkspaceGeometryMeasurements,
): Readonly<{ height: number; width: number }> | null {
  if (!section.childLayout || overflow !== "scroll") {
    return null;
  }
  const axis = section.childLayout.orientation === "vertical" ? "height" : "width";
  if (section.size[axis].mode === "fixed") {
    return null;
  }
  geometry.flushMeasurement();
  const rect = geometry.workspaceRect(section.id);
  return rect ? { height: rect.height, width: rect.width } : null;
}

export function useWorkspaceSectionOverflowActions<TSectionData>({
  document,
  geometry,
  onCommit,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  onCommit: WorkspaceSectionOverflowCommit;
}>) {
  const documentRef = useRef(document);
  const onCommitRef = useRef(onCommit);
  documentRef.current = document;
  onCommitRef.current = onCommit;
  const pendingRef = useRef<PendingOverflow | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [synchronizationRevision, setSynchronizationRevision] = useState(0);

  const handleCommit = useCallback(
    (sectionId: string, overflow: SectionOverflow) => {
      const section = documentRef.current.sections[sectionId];
      if (!section?.childLayout) {
        throw new Error(`Workspace overflow action is missing container ${sectionId}.`);
      }
      const action = { overflow, sectionId, title: section.title } as const;
      const measuredSize = measuredSizeForOverflow(
        section as WorkspaceSection<unknown>,
        overflow,
        geometry,
      );
      const result = onCommitRef.current(sectionId, overflow, measuredSize);
      pendingRef.current = result.status === "applied" ? action : null;
      if (result.status !== "applied") {
        setAnnouncementText(
          "reason" in result
            ? rejectedOverflowAnnouncement(action, result.reason)
            : `${action.title} is already ${overflowState(action.overflow)}.`,
        );
      }
      setSynchronizationRevision((revision) => revision + 1);
      return result;
    },
    [geometry],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    const accepted =
      document.sections[pending.sectionId]?.childLayout?.overflow === pending.overflow;
    setAnnouncementText(overflowAnnouncement(pending, accepted));
    pendingRef.current = null;
  }, [document.sections, synchronizationRevision]);

  return { announcementText, handleCommit };
}

function OverflowIcon({ scrolling }: Readonly<{ scrolling: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <rect height="12" rx="2" width="13" x="3.5" y="4" />
      {scrolling ? (
        <>
          <path d="M6.5 8h5M6.5 11h5" />
          <path d="m13 8 1.5 2-1.5 2" />
        </>
      ) : (
        <path d="M6.5 8h7M6.5 11h7" />
      )}
    </svg>
  );
}

export function WorkspaceSectionOverflowControl({
  controlRef,
  layoutEditable,
  onCommit,
  section,
}: Readonly<{
  controlRef: RefObject<HTMLButtonElement | null>;
  layoutEditable: boolean;
  onCommit(sectionId: string, overflow: SectionOverflow): WorkspaceActionResult;
  section: WorkspaceSection<unknown>;
}>) {
  const scrolling = section.childLayout?.overflow === "scroll";
  if (!section.childLayout) {
    return null;
  }
  const nextOverflow = scrolling ? "grow" : "scroll";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onCommit(section.id, nextOverflow);
  };
  return (
    <button
      aria-label={`Scroll ${section.title} child sections`}
      aria-pressed={scrolling}
      className="setta-workspace__section-edit-control setta-workspace__section-overflow-control"
      data-workspace-section-layout-control="overflow"
      disabled={!layoutEditable || section.positionAndSizeLocked || section.isMinimized}
      onClick={handleClick}
      ref={controlRef}
      type="button"
    >
      <OverflowIcon scrolling={scrolling} />
    </button>
  );
}

function childRegionCanScroll(element: HTMLElement): boolean {
  const tolerance = 1;
  return (
    element.scrollHeight - element.clientHeight > tolerance ||
    element.scrollWidth - element.clientWidth > tolerance
  );
}

export function useWorkspaceChildRegionScrollability(
  children: readonly unknown[],
  scrollMode: boolean,
) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    if (!element || !scrollMode) {
      setScrollable(false);
      return;
    }
    const measure = () => setScrollable(childRegionCanScroll(element));
    measure();
    const ResizeObserverConstructor = element.ownerDocument.defaultView?.ResizeObserver;
    if (!ResizeObserverConstructor) {
      return;
    }
    const observer = new ResizeObserverConstructor(measure);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [children, element, scrollMode]);

  return { ref: setElement, scrollable };
}
