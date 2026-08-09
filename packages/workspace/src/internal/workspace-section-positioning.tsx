import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

import type {
  SectionOrientation,
  WorkspaceActionResult,
  WorkspaceChildLayoutPositioningChange,
  WorkspaceDocument,
  WorkspaceFreeformChildLayout,
  WorkspacePoint,
  WorkspaceSection,
} from "../core.js";
import type { WorkspaceRect } from "./geometry-index.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";

const POSITION_TOLERANCE = 0.75;
const POSITION_PRECISION = 1_000;
const CHILD_REGION_ATTRIBUTE = "data-workspace-section-child-region";

type ChildSize = Readonly<{ height: number; width: number }>;

type PositioningAction = Readonly<{
  change: WorkspaceChildLayoutPositioningChange;
  sectionId: string;
  title: string;
}>;

type PositioningDialogState = Readonly<{
  childCount: number;
  orientation: SectionOrientation | null;
  sectionId: string;
  step: "choose" | "confirm";
  title: string;
}>;

type PositioningConfirmation = Readonly<{
  orientation: SectionOrientation;
  section: WorkspaceSection<unknown>;
}>;

function positioningConfirmation(
  document: WorkspaceDocument<unknown>,
  state: PositioningDialogState | null,
  trigger: HTMLButtonElement | null,
): PositioningConfirmation | null {
  if (!state?.orientation) {
    return null;
  }
  const section = document.sections[state.sectionId];
  if (!section || section.childLayout?.positioning !== "freeform" || !trigger?.isConnected) {
    return null;
  }
  return { orientation: state.orientation, section };
}

function recordFromEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

function roundedPosition(value: number): number {
  return Math.max(0, Math.round(value * POSITION_PRECISION) / POSITION_PRECISION);
}

function requiredRects(
  sectionIds: readonly string[],
  rects: Readonly<Record<string, WorkspaceRect>>,
): readonly WorkspaceRect[] | null {
  const resolved = sectionIds.map((sectionId) => rects[sectionId]);
  return resolved.every((rect): rect is WorkspaceRect => Boolean(rect)) ? resolved : null;
}

export function workspaceFreeformPositionsFromRects(
  sectionIds: readonly string[],
  rects: Readonly<Record<string, WorkspaceRect>>,
): Readonly<Record<string, WorkspacePoint>> | null {
  if (sectionIds.length === 0) {
    return {};
  }
  const resolved = requiredRects(sectionIds, rects);
  if (!resolved) {
    return null;
  }
  const minimumX = Math.min(...resolved.map(({ x }) => x));
  const minimumY = Math.min(...resolved.map(({ y }) => y));
  return recordFromEntries(
    sectionIds.map((sectionId, index) => {
      const rect = resolved[index] as WorkspaceRect;
      return [
        sectionId,
        { x: roundedPosition(rect.x - minimumX), y: roundedPosition(rect.y - minimumY) },
      ] as const;
    }),
  );
}

function positionsClose(left: WorkspacePoint, right: WorkspacePoint): boolean {
  return (
    Math.abs(left.x - right.x) <= POSITION_TOLERANCE &&
    Math.abs(left.y - right.y) <= POSITION_TOLERANCE
  );
}

function orderedPosition(
  cursor: number,
  direction: "ltr" | "rtl",
  orientation: SectionOrientation,
  size: ChildSize,
  surfaceWidth: number,
): WorkspacePoint {
  if (orientation === "vertical") {
    return { x: direction === "rtl" ? surfaceWidth - size.width : 0, y: cursor };
  }
  return {
    x: direction === "rtl" ? surfaceWidth - cursor - size.width : cursor,
    y: 0,
  };
}

export function workspaceOrderedPositioningMateriallyRearranges({
  direction,
  gap,
  orientation,
  positions,
  sectionIds,
  sizes,
  surfaceWidth,
}: Readonly<{
  direction: "ltr" | "rtl";
  gap: number;
  orientation: SectionOrientation;
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionIds: readonly string[];
  sizes: Readonly<Record<string, ChildSize>>;
  surfaceWidth: number;
}>): boolean {
  let cursor = 0;
  for (const sectionId of sectionIds) {
    const position = positions[sectionId];
    const size = sizes[sectionId];
    if (!position || !size) {
      return true;
    }
    if (
      !positionsClose(position, orderedPosition(cursor, direction, orientation, size, surfaceWidth))
    ) {
      return true;
    }
    cursor += (orientation === "vertical" ? size.height : size.width) + gap;
  }
  return false;
}

function measuredRects(
  sectionIds: readonly string[],
  geometry: WorkspaceGeometryMeasurements,
): Readonly<Record<string, WorkspaceRect>> | null {
  geometry.flushMeasurement();
  const entries = sectionIds.map((sectionId) => {
    const rect = geometry.workspaceRect(sectionId);
    return rect ? ([sectionId, rect] as const) : null;
  });
  return entries.every((entry): entry is readonly [string, WorkspaceRect] => entry !== null)
    ? recordFromEntries(entries)
    : null;
}

function measureWorkspaceSectionFreeformPositions(
  section: WorkspaceSection<unknown>,
  geometry: WorkspaceGeometryMeasurements,
): Readonly<Record<string, WorkspacePoint>> | null {
  const childLayout = section.childLayout;
  if (!childLayout || childLayout.positioning !== "ordered") {
    return null;
  }
  const rects = measuredRects(childLayout.sectionIds, geometry);
  return rects ? workspaceFreeformPositionsFromRects(childLayout.sectionIds, rects) : null;
}

function childRegion(
  geometry: WorkspaceGeometryMeasurements,
  sectionId: string,
): HTMLElement | null {
  const canvas = geometry.canvasElement();
  if (!canvas) {
    return null;
  }
  const matches = [...canvas.querySelectorAll<HTMLElement>(`[${CHILD_REGION_ATTRIBUTE}]`)].filter(
    (element) => element.getAttribute(CHILD_REGION_ATTRIBUTE) === sectionId,
  );
  return matches.length === 1 ? (matches[0] as HTMLElement) : null;
}

function finiteGap(value: string): number | null {
  const gap = Number.parseFloat(value);
  return Number.isFinite(gap) && gap >= 0 ? gap : null;
}

function childSizes(
  sectionIds: readonly string[],
  rects: Readonly<Record<string, WorkspaceRect>>,
): Readonly<Record<string, ChildSize>> {
  return recordFromEntries(
    sectionIds.map((sectionId) => {
      const rect = rects[sectionId] as WorkspaceRect;
      return [sectionId, { height: rect.height, width: rect.width }] as const;
    }),
  );
}

function fallbackSurfaceWidth(
  sectionIds: readonly string[],
  positions: Readonly<Record<string, WorkspacePoint>>,
  sizes: Readonly<Record<string, ChildSize>>,
): number {
  return Math.max(
    0,
    ...sectionIds.map((sectionId) => {
      const position = positions[sectionId] as WorkspacePoint;
      const size = sizes[sectionId] as ChildSize;
      return position.x + size.width;
    }),
  );
}

function freeformPositioningMeasurement(
  sectionId: string,
  childLayout: WorkspaceFreeformChildLayout,
  orientation: SectionOrientation,
  geometry: WorkspaceGeometryMeasurements,
) {
  const rects = measuredRects(childLayout.sectionIds, geometry);
  if (!rects) {
    return null;
  }
  const region = childRegion(geometry, sectionId);
  if (!region) {
    return null;
  }
  const surface = region.querySelector<HTMLElement>(
    ":scope > [data-workspace-freeform-child-surface]",
  );
  if (!surface) {
    return null;
  }
  const view = region.ownerDocument.defaultView;
  if (!view) {
    return null;
  }
  const style = view.getComputedStyle(region);
  const gap = finiteGap(orientation === "vertical" ? style.rowGap : style.columnGap);
  if (gap === null) {
    return null;
  }
  const sizes = childSizes(childLayout.sectionIds, rects);
  return {
    direction: style.direction === "rtl" ? ("rtl" as const) : ("ltr" as const),
    gap,
    sizes,
    surfaceWidth:
      surface.clientWidth ||
      fallbackSurfaceWidth(childLayout.sectionIds, childLayout.positions, sizes),
  };
}

function workspaceSectionPositioningMateriallyRearranges(
  section: WorkspaceSection<unknown>,
  orientation: SectionOrientation,
  geometry: WorkspaceGeometryMeasurements,
): boolean | null {
  const childLayout = section.childLayout;
  if (childLayout?.positioning !== "freeform") {
    return null;
  }
  if (childLayout.sectionIds.length === 0) {
    return false;
  }
  const measurement = freeformPositioningMeasurement(
    section.id,
    childLayout,
    orientation,
    geometry,
  );
  if (!measurement) {
    return null;
  }
  return workspaceOrderedPositioningMateriallyRearranges({
    direction: measurement.direction,
    gap: measurement.gap,
    orientation,
    positions: childLayout.positions,
    sectionIds: childLayout.sectionIds,
    sizes: measurement.sizes,
    surfaceWidth: measurement.surfaceWidth,
  });
}

function orientationAdverb(orientation: SectionOrientation): "horizontally" | "vertically" {
  return orientation === "horizontal" ? "horizontally" : "vertically";
}

function positioningMatches(
  document: WorkspaceDocument<unknown>,
  action: PositioningAction,
): boolean {
  const layout = document.sections[action.sectionId]?.childLayout;
  if (action.change.positioning === "ordered") {
    return layout?.positioning === "ordered" && layout.orientation === action.change.orientation;
  }
  if (layout?.positioning !== "freeform") {
    return false;
  }
  const expected = action.change.positions;
  return (
    Object.keys(expected).length === Object.keys(layout.positions).length &&
    Object.entries(expected).every(([sectionId, position]) => {
      const accepted = layout.positions[sectionId];
      return accepted?.x === position.x && accepted.y === position.y;
    })
  );
}

function acceptedPositioningAnnouncement(action: PositioningAction, accepted: boolean): string {
  if (!accepted) {
    return `${action.title} child positioning did not change because the host did not accept the change.`;
  }
  return action.change.positioning === "freeform"
    ? `${action.title} child sections use freeform positioning.`
    : `${action.title} child sections are arranged ${orientationAdverb(action.change.orientation)}.`;
}

function rejectedPositioningAnnouncement(action: PositioningAction, reason: string): string {
  if (reason === "layout-edit-disabled") {
    return `Unable to change ${action.title} child positioning. Turn on layout editing and try again.`;
  }
  if (reason === "section-locked") {
    return `${action.title} is locked. Unlock it to change child positioning.`;
  }
  if (reason === "section-minimized") {
    return `Expand ${action.title} before changing child positioning.`;
  }
  if (reason === "section-geometry-unavailable") {
    return `${action.title} must be measured before its child positioning can change.`;
  }
  return `Unable to change ${action.title} child positioning.`;
}

function geometryUnavailableAnnouncement(title: string): string {
  return `${title} child sections must be measured before their positioning can change.`;
}

function focusTrigger(trigger: HTMLButtonElement | null): void {
  if (!trigger?.isConnected) {
    return;
  }
  const view = trigger.ownerDocument.defaultView;
  if (!view) {
    trigger.focus({ preventScroll: true });
    return;
  }
  view.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
}

function childCountLabel(count: number): string {
  return `${String(count)} child ${count === 1 ? "section" : "sections"}`;
}

function usePositioningDialogLifecycle(
  dialogRef: Readonly<{ current: HTMLDialogElement | null }>,
  cancelRef: Readonly<{ current: HTMLButtonElement | null }>,
  verticalRef: Readonly<{ current: HTMLButtonElement | null }>,
  state: PositioningDialogState | null,
): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!state) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    const focusTarget = state.step === "confirm" ? cancelRef.current : verticalRef.current;
    focusTarget?.focus({ preventScroll: true });
  }, [cancelRef, dialogRef, state, verticalRef]);
}

function positioningDialogDescription(
  state: PositioningDialogState | null,
  confirmation: SectionOrientation | null,
): string {
  if (!state) {
    return "Choose an ordered layout for this container.";
  }
  return confirmation
    ? `This will move ${childCountLabel(state.childCount)} in ${state.title} into ${confirmation} order.`
    : `Choose an ordered layout for ${state.title}.`;
}

function WorkspaceSectionPositioningChoices({
  cancelRef,
  confirmation,
  onCancel,
  onChoose,
  onConfirm,
  verticalRef,
}: Readonly<{
  cancelRef: RefObject<HTMLButtonElement | null>;
  confirmation: SectionOrientation | null;
  onCancel(): void;
  onChoose(orientation: SectionOrientation): void;
  onConfirm(): void;
  verticalRef: RefObject<HTMLButtonElement | null>;
}>) {
  return (
    <div
      aria-label="Child positioning choices"
      className="setta-workspace__selection-action-group"
      role="group"
    >
      {confirmation ? (
        <button onClick={onConfirm} type="button">
          Arrange {orientationAdverb(confirmation)}
        </button>
      ) : (
        <>
          <button onClick={() => onChoose("vertical")} ref={verticalRef} type="button">
            Arrange vertically
          </button>
          <button onClick={() => onChoose("horizontal")} type="button">
            Arrange horizontally
          </button>
        </>
      )}
      <button onClick={onCancel} ref={cancelRef} type="button">
        Cancel
      </button>
    </div>
  );
}

function WorkspaceSectionPositioningDialog({
  dialogId,
  onChoose,
  onConfirm,
  onDismiss,
  state,
}: Readonly<{
  dialogId: string;
  onChoose(orientation: SectionOrientation): void;
  onConfirm(): void;
  onDismiss(): void;
  state: PositioningDialogState | null;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const verticalRef = useRef<HTMLButtonElement>(null);
  usePositioningDialogLifecycle(dialogRef, cancelRef, verticalRef, state);
  const confirmation = state?.step === "confirm" ? state.orientation : null;
  return (
    <dialog
      aria-describedby={`${dialogId}-description`}
      aria-labelledby={`${dialogId}-title`}
      className={`setta-workspace__selection-action-dialog setta-workspace__section-positioning-dialog ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-local-shortcuts=""
      data-workspace-section-positioning-step={state?.step}
      id={dialogId}
      onClose={onDismiss}
      ref={dialogRef}
    >
      <div className="setta-workspace__selection-action-surface">
        <div className="setta-workspace__selection-action-heading-row">
          <div className="setta-workspace__selection-action-heading">
            <p>Child positioning</p>
            <h2 id={`${dialogId}-title`}>
              {confirmation ? "Arrange child sections?" : "Arrange child sections"}
            </h2>
          </div>
          <button
            aria-label="Close child positioning"
            className="setta-workspace__selection-action-close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p
          className="setta-workspace__section-positioning-description"
          id={`${dialogId}-description`}
        >
          {positioningDialogDescription(state, confirmation)}
        </p>
        <WorkspaceSectionPositioningChoices
          cancelRef={cancelRef}
          confirmation={confirmation}
          onCancel={() => dialogRef.current?.close()}
          onChoose={onChoose}
          onConfirm={onConfirm}
          verticalRef={verticalRef}
        />
      </div>
    </dialog>
  );
}

export function useWorkspaceSectionPositioningActions<TSectionData>({
  document,
  geometry,
  onCommit,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  onCommit(sectionId: string, change: WorkspaceChildLayoutPositioningChange): WorkspaceActionResult;
}>) {
  const dialogId = `setta-workspace-section-positioning-${useId().replaceAll(":", "")}`;
  const documentRef = useRef(document);
  const onCommitRef = useRef(onCommit);
  const pendingRef = useRef<PositioningAction | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [dialogState, setDialogState] = useState<PositioningDialogState | null>(null);
  const [synchronizationRevision, setSynchronizationRevision] = useState(0);
  documentRef.current = document;
  onCommitRef.current = onCommit;

  const dismissDialog = useCallback(() => {
    setDialogState(null);
    focusTrigger(triggerRef.current);
  }, []);

  const commit = useCallback((action: PositioningAction) => {
    const result = onCommitRef.current(action.sectionId, action.change);
    pendingRef.current = result.status === "applied" ? action : null;
    if (result.status !== "applied") {
      setAnnouncementText(
        "reason" in result
          ? rejectedPositioningAnnouncement(action, result.reason)
          : `${action.title} already uses the selected child positioning.`,
      );
    }
    setSynchronizationRevision((revision) => revision + 1);
    return result;
  }, []);

  const handleRequest = useCallback(
    (sectionId: string, trigger: HTMLButtonElement) => {
      const section = documentRef.current.sections[sectionId];
      const childLayout = section?.childLayout;
      if (!section || !childLayout) {
        setAnnouncementText("Unable to change child positioning for an unavailable container.");
        return;
      }
      triggerRef.current = trigger;
      if (childLayout.positioning === "freeform") {
        setDialogState({
          childCount: childLayout.sectionIds.length,
          orientation: null,
          sectionId,
          step: "choose",
          title: section.title,
        });
        return;
      }
      const positions = measureWorkspaceSectionFreeformPositions(
        section as WorkspaceSection<unknown>,
        geometry,
      );
      if (!positions) {
        setAnnouncementText(geometryUnavailableAnnouncement(section.title));
        return;
      }
      commit({ change: { positioning: "freeform", positions }, sectionId, title: section.title });
      focusTrigger(trigger);
    },
    [commit, geometry],
  );

  const chooseOrientation = useCallback(
    (orientation: SectionOrientation) => {
      const current = dialogState;
      const section = current ? documentRef.current.sections[current.sectionId] : undefined;
      if (!current || !section || section.childLayout?.positioning !== "freeform") {
        setAnnouncementText("The container changed before child positioning could be selected.");
        dismissDialog();
        return;
      }
      const rearranges = workspaceSectionPositioningMateriallyRearranges(
        section as WorkspaceSection<unknown>,
        orientation,
        geometry,
      );
      if (rearranges === null) {
        setAnnouncementText(geometryUnavailableAnnouncement(section.title));
        dismissDialog();
        return;
      }
      if (rearranges) {
        setDialogState({ ...current, orientation, step: "confirm" });
        return;
      }
      commit({
        change: { orientation, positioning: "ordered" },
        sectionId: section.id,
        title: section.title,
      });
      dismissDialog();
    },
    [commit, dialogState, dismissDialog, geometry],
  );

  const confirmOrientation = useCallback(() => {
    const confirmation = positioningConfirmation(
      documentRef.current as WorkspaceDocument<unknown>,
      dialogState,
      triggerRef.current,
    );
    if (!confirmation) {
      setAnnouncementText("The container changed before child positioning could be selected.");
      dismissDialog();
      return;
    }
    const rearranges = workspaceSectionPositioningMateriallyRearranges(
      confirmation.section,
      confirmation.orientation,
      geometry,
    );
    if (rearranges === null) {
      setAnnouncementText(geometryUnavailableAnnouncement(confirmation.section.title));
      dismissDialog();
      return;
    }
    commit({
      change: { orientation: confirmation.orientation, positioning: "ordered" },
      sectionId: confirmation.section.id,
      title: confirmation.section.title,
    });
    dismissDialog();
  }, [commit, dialogState, dismissDialog, geometry]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    setAnnouncementText(
      acceptedPositioningAnnouncement(
        pending,
        positioningMatches(document as WorkspaceDocument<unknown>, pending),
      ),
    );
    pendingRef.current = null;
  }, [document, synchronizationRevision]);

  return {
    announcementText,
    dialog: (
      <WorkspaceSectionPositioningDialog
        dialogId={dialogId}
        onChoose={chooseOrientation}
        onConfirm={confirmOrientation}
        onDismiss={dismissDialog}
        state={dialogState}
      />
    ),
    handleRequest,
  };
}

// Both positioning-icon variants are module constants so the frame rerenders
// that accompany every selection commit bail out of the SVG subtree.
function positioningIcon(freeform: boolean) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      {freeform ? (
        <>
          <rect height="5" rx="1.25" width="5" x="2.5" y="3" />
          <rect height="5" rx="1.25" width="5" x="12.5" y="5.5" />
          <rect height="5" rx="1.25" width="5" x="6.5" y="12" />
        </>
      ) : (
        <>
          <rect height="3" rx="1.25" width="11" x="4.5" y="3" />
          <rect height="3" rx="1.25" width="11" x="4.5" y="8.5" />
          <rect height="3" rx="1.25" width="11" x="4.5" y="14" />
        </>
      )}
    </svg>
  );
}

const freeformPositioningIcon = positioningIcon(true);
const orderedPositioningIcon = positioningIcon(false);

function PositioningIcon({ positioning }: Readonly<{ positioning: "freeform" | "ordered" }>) {
  return positioning === "freeform" ? freeformPositioningIcon : orderedPositioningIcon;
}

export function WorkspaceSectionPositioningControl({
  layoutEditable,
  onRequest,
  section,
}: Readonly<{
  layoutEditable: boolean;
  onRequest(sectionId: string, trigger: HTMLButtonElement): void;
  section: WorkspaceSection<unknown>;
}>) {
  const childLayout = section.childLayout;
  if (!childLayout) {
    return null;
  }
  const nextPositioning = childLayout.positioning === "ordered" ? "freeform" : "ordered";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRequest(section.id, event.currentTarget);
  };
  return (
    <button
      aria-haspopup={childLayout.positioning === "freeform" ? "dialog" : undefined}
      aria-label={
        childLayout.positioning === "ordered"
          ? `Use freeform positioning for ${section.title} child sections`
          : `Change ${section.title} child positioning`
      }
      className="setta-workspace__section-edit-control setta-workspace__section-positioning-control"
      data-workspace-current-positioning={childLayout.positioning}
      data-workspace-next-positioning={nextPositioning}
      data-workspace-section-layout-control="positioning"
      disabled={!layoutEditable || section.positionAndSizeLocked || section.isMinimized}
      onClick={handleClick}
      type="button"
    >
      <PositioningIcon positioning={nextPositioning} />
    </button>
  );
}
