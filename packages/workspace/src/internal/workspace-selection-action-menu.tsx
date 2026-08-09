import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import type {
  WorkspaceActionResult,
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceJsonValue,
} from "../core.js";
import { deriveWorkspaceParentLookup } from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  planWorkspaceRootStacking,
  workspaceRootStackingMatches,
  type WorkspaceRootStackingAction,
} from "./workspace-root-stacking.js";
import {
  workspaceSectionGroupingMatches,
  workspaceSectionUngroupingMatches,
} from "./workspace-section-grouping.js";
import {
  planWorkspaceSelectionActions,
  type WorkspaceSelectionActionId,
  type WorkspaceSelectionActionPlan,
} from "./workspace-selection-actions.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

type ClientPoint = Readonly<{ x: number; y: number }>;
type SelectionActionMenuState = Readonly<{
  anchor: ClientPoint;
  canvasElement: HTMLElement;
  restoreFocus: HTMLElement;
  sectionIds: readonly string[];
}>;

type PendingSelectionAction = Readonly<{
  actionId: WorkspaceSelectionActionId;
  canvasElement: HTMLElement;
  expectedLocked: boolean | undefined;
  expectedRootIds: readonly string[] | undefined;
  grouping:
    | Readonly<{ parentSectionId: string | null }>
    | Readonly<{
        childSectionIds: readonly string[];
        groupSectionId: string;
        parentSectionId: string | null;
      }>
    | undefined;
  restoreFocus: HTMLElement;
  sectionIds: readonly string[];
}>;

const actionGroups = [
  ["lock", "unlock"],
  ["bring-to-front", "bring-forward", "send-backward", "send-to-back"],
  ["group", "ungroup"],
  ["delete"],
] as const satisfies readonly (readonly WorkspaceSelectionActionId[])[];

const stackingActionIds = new Set<WorkspaceSelectionActionId>([
  "bring-forward",
  "bring-to-front",
  "send-backward",
  "send-to-back",
]);

function eventTargetElement(target: EventTarget | null, ownerDocument: Document): Element | null {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  return ElementConstructor && target instanceof ElementConstructor ? target : null;
}

function selectionContextTarget(target: Element): HTMLElement | null {
  if (
    target.closest(
      ".setta-workspace__section-content, input, select, textarea, [contenteditable='true']",
    )
  ) {
    return null;
  }
  return target.closest<HTMLElement>("[data-workspace-section-id]");
}

function contextRestoreFocus(target: Element, sectionFrame: HTMLElement): HTMLElement {
  return (
    target.closest<HTMLElement>(
      "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ) ?? sectionFrame
  );
}

function keyboardContextShortcut(event: ReactKeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

function keyboardSelectionContext(event: ReactKeyboardEvent<HTMLDivElement>): Readonly<{
  sectionId: string;
  target: HTMLElement;
}> | null {
  const target = eventTargetElement(event.target, event.currentTarget.ownerDocument);
  if (!target) {
    return null;
  }
  const sectionFrame = selectionContextTarget(target);
  const sectionId = sectionFrame?.dataset.workspaceSectionId;
  return sectionId && sectionFrame
    ? { sectionId, target: contextRestoreFocus(target, sectionFrame) }
    : null;
}

function keyboardAnchor(target: HTMLElement): ClientPoint {
  const bounds = target.getBoundingClientRect();
  const direction = target.ownerDocument.defaultView?.getComputedStyle(target).direction;
  return {
    x:
      direction === "rtl"
        ? bounds.right - Math.min(24, bounds.width / 2)
        : bounds.left + Math.min(24, bounds.width / 2),
    y: bounds.bottom,
  };
}

function pointerAnchor(
  event: Pick<MouseEvent, "button" | "clientX" | "clientY">,
  target: HTMLElement,
): ClientPoint {
  return event.button === 0 && event.clientX === 0 && event.clientY === 0
    ? keyboardAnchor(target)
    : { x: event.clientX, y: event.clientY };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function menuAxisPosition(
  anchor: number,
  canvasEnd: number,
  canvasStart: number,
  menuSize: number,
  viewportSize: number,
): number {
  const margin = 12;
  const viewportMinimum = margin;
  const viewportMaximum = Math.max(viewportMinimum, viewportSize - menuSize - margin);
  const canvasMinimum = Math.max(viewportMinimum, canvasStart + margin);
  const canvasMaximum = Math.min(viewportMaximum, canvasEnd - menuSize - margin);
  return canvasMinimum <= canvasMaximum
    ? clamp(anchor, canvasMinimum, canvasMaximum)
    : clamp(anchor, viewportMinimum, viewportMaximum);
}

function positionMenu(
  dialog: HTMLDialogElement,
  anchor: ClientPoint,
  canvasElement: HTMLElement,
): void {
  dialog.style.removeProperty("left");
  dialog.style.removeProperty("top");
  const view = dialog.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const canvasBounds = canvasElement.getBoundingClientRect();
  const visibleCanvasHeight =
    Math.min(view.innerHeight, canvasBounds.bottom) - Math.max(0, canvasBounds.top);
  dialog.style.setProperty(
    "--setta-workspace-selection-menu-max-block-size",
    `${String(Math.max(160, visibleCanvasHeight - 24))}px`,
  );
  const bounds = dialog.getBoundingClientRect();
  const left = menuAxisPosition(
    anchor.x,
    canvasBounds.right,
    canvasBounds.left,
    bounds.width,
    view.innerWidth,
  );
  const top = menuAxisPosition(
    anchor.y,
    canvasBounds.bottom,
    canvasBounds.top,
    bounds.height,
    view.innerHeight,
  );
  dialog.style.left = `${String(left)}px`;
  dialog.style.top = `${String(top)}px`;
}

function focusElement(
  element: HTMLElement | null,
  fallbackCanvas: HTMLElement | null = null,
): void {
  const ownerDocument = element?.ownerDocument ?? fallbackCanvas?.ownerDocument;
  if (!ownerDocument) {
    return;
  }
  const focus = () => {
    const target = element?.isConnected ? element : fallbackActionFocus(fallbackCanvas);
    target?.focus({ preventScroll: true });
  };
  const view = ownerDocument.defaultView;
  if (view) {
    view.requestAnimationFrame(focus);
  } else {
    focus();
  }
}

function fallbackActionFocus(canvasElement: HTMLElement | null): HTMLElement | null {
  return (
    canvasElement?.querySelector<HTMLElement>(
      "[data-workspace-selection-control], .setta-workspace__toolbar button:not(:disabled)",
    ) ?? null
  );
}

function selectedSubject(count: number): string {
  return count === 1 ? "The selected section" : `The ${String(count)} selected sections`;
}

function completedActionText(actionId: WorkspaceSelectionActionId, count: number): string {
  const subject = selectedSubject(count);
  const completion: Partial<Record<WorkspaceSelectionActionId, string>> = {
    "bring-forward": "moved forward",
    "bring-to-front": "brought to front",
    delete: "deleted",
    group: "grouped",
    lock: "locked",
    "send-backward": "moved backward",
    "send-to-back": "sent to back",
    unlock: "unlocked",
    ungroup: "ungrouped",
  };
  return `${subject} ${count === 1 ? "was" : "were"} ${completion[actionId] ?? "updated"}.`;
}

function declinedActionText(count: number): string {
  return `${selectedSubject(count)} ${count === 1 ? "remains" : "remain"} unchanged because the host did not accept the action.`;
}

function actionOwnsResultingFocus(actionId: WorkspaceSelectionActionId): boolean {
  return actionId === "group" || actionId === "ungroup";
}

type WorkspaceRejectedActionReason = Extract<
  WorkspaceActionResult,
  { status: "rejected" }
>["reason"];

const rejectionText: Partial<Record<WorkspaceRejectedActionReason, string>> = {
  "group-kind-cannot-contain-sections":
    "Unable to group the selected sections. The group factory must return a registered container kind.",
  "grouping-unavailable":
    "Unable to group the selected sections. Configure a group factory and try again.",
  "layout-edit-disabled":
    "Unable to update the selected sections. Turn on layout editing and try again.",
  "section-id-exists":
    "Unable to group the selected sections. The group factory returned an ID already in use.",
  "section-not-container": "Unable to ungroup the section. Select a container with child sections.",
  "structure-edit-disabled":
    "Unable to update the selected sections. Turn on structure editing and try again.",
};

function rejectedActionText(
  result: WorkspaceActionResult,
  actionId: WorkspaceSelectionActionId,
): string {
  if (result.status !== "rejected") {
    return "The selected sections are already in that state.";
  }
  if (result.reason === "canvas-unavailable" || result.reason === "section-geometry-unavailable") {
    return `Unable to ${actionId === "ungroup" ? "ungroup the section" : "group the selected sections"}. Wait for the canvas to finish rendering and try again.`;
  }
  return rejectionText[result.reason] ?? "Unable to update the selected sections.";
}

function parentSectionId(
  parentLookup: ReadonlyMap<string, string | null>,
  sectionId: string,
): string | null {
  return parentLookup.get(sectionId) ?? null;
}

function groupingAccepted(
  document: WorkspaceDocument<unknown>,
  pending: PendingSelectionAction,
): boolean {
  const grouping = pending.grouping;
  if (!grouping || "groupSectionId" in grouping) {
    return false;
  }
  const parentLookup = deriveWorkspaceParentLookup(document);
  const groupSectionId = parentSectionId(parentLookup, firstSectionId(pending.sectionIds));
  if (groupSectionId === null || groupSectionId === grouping.parentSectionId) {
    return false;
  }
  return workspaceSectionGroupingMatches(
    document,
    groupSectionId,
    grouping.parentSectionId,
    pending.sectionIds,
  );
}

function ungroupingAccepted(
  document: WorkspaceDocument<unknown>,
  pending: PendingSelectionAction,
): boolean {
  const grouping = pending.grouping;
  if (!grouping || !("groupSectionId" in grouping)) {
    return false;
  }
  return workspaceSectionUngroupingMatches(
    document,
    grouping.groupSectionId,
    grouping.parentSectionId,
    grouping.childSectionIds,
  );
}

function pendingActionAccepted(
  document: WorkspaceDocument<unknown>,
  pending: PendingSelectionAction,
): boolean {
  if (pending.actionId === "delete") {
    return pending.sectionIds.every((sectionId) => !Object.hasOwn(document.sections, sectionId));
  }
  if (pending.expectedLocked !== undefined) {
    return pending.sectionIds.every(
      (sectionId) => document.sections[sectionId]?.positionAndSizeLocked === pending.expectedLocked,
    );
  }
  if (pending.actionId === "group") {
    return groupingAccepted(document, pending);
  }
  if (pending.actionId === "ungroup") {
    return ungroupingAccepted(document, pending);
  }
  return pending.expectedRootIds
    ? workspaceRootStackingMatches(
        document.rootSections,
        pending.expectedRootIds.map((sectionId) => ({ position: { x: 0, y: 0 }, sectionId })),
      )
    : false;
}

type SelectionActionRunner = (
  controller: WorkspaceController<unknown>,
  sectionIds: readonly string[],
) => WorkspaceActionResult;

function firstSectionId(sectionIds: readonly string[]): string {
  const sectionId = sectionIds[0];
  if (!sectionId) {
    throw new Error("Workspace selection action requires one selected section.");
  }
  return sectionId;
}

const actionRunners: Record<WorkspaceSelectionActionId, SelectionActionRunner> = {
  "bring-forward": (controller, sectionIds) => controller.bringForward(sectionIds),
  "bring-to-front": (controller, sectionIds) => controller.bringToFront(sectionIds),
  delete: (controller, sectionIds) => controller.deleteSections(sectionIds),
  group: (controller, sectionIds) => controller.groupSections(sectionIds),
  lock: (controller, sectionIds) => controller.setSectionsLocked(sectionIds, true),
  "send-backward": (controller, sectionIds) => controller.sendBackward(sectionIds),
  "send-to-back": (controller, sectionIds) => controller.sendToBack(sectionIds),
  ungroup: (controller, sectionIds) => controller.ungroupSection(firstSectionId(sectionIds)),
  unlock: (controller, sectionIds) => controller.setSectionsLocked(sectionIds, false),
};

function actionResult(
  controller: WorkspaceController<unknown>,
  actionId: WorkspaceSelectionActionId,
  sectionIds: readonly string[],
): WorkspaceActionResult {
  return actionRunners[actionId](controller, sectionIds);
}

function expectedRootIds(
  document: WorkspaceDocument<unknown>,
  actionId: WorkspaceSelectionActionId,
  sectionIds: readonly string[],
): readonly string[] | undefined {
  if (!stackingActionIds.has(actionId)) {
    return undefined;
  }
  return planWorkspaceRootStacking(
    document,
    sectionIds,
    actionId as WorkspaceRootStackingAction,
  ).map(({ sectionId }) => sectionId);
}

function pendingGrouping(
  document: WorkspaceDocument<unknown>,
  actionId: WorkspaceSelectionActionId,
  sectionIds: readonly string[],
): PendingSelectionAction["grouping"] {
  const parentLookup = deriveWorkspaceParentLookup(document);
  if (actionId === "group") {
    return { parentSectionId: parentLookup.get(firstSectionId(sectionIds)) ?? null };
  }
  if (actionId !== "ungroup") {
    return undefined;
  }
  const groupSectionId = firstSectionId(sectionIds);
  const childSectionIds = document.sections[groupSectionId]?.childLayout?.sectionIds;
  return childSectionIds
    ? {
        childSectionIds,
        groupSectionId,
        parentSectionId: parentLookup.get(groupSectionId) ?? null,
      }
    : undefined;
}

function pendingAction(
  document: WorkspaceDocument<unknown>,
  actionId: WorkspaceSelectionActionId,
  state: SelectionActionMenuState,
): PendingSelectionAction {
  return {
    actionId,
    canvasElement: state.canvasElement,
    expectedLocked: actionId === "lock" ? true : actionId === "unlock" ? false : undefined,
    expectedRootIds: expectedRootIds(document, actionId, state.sectionIds),
    grouping: pendingGrouping(document, actionId, state.sectionIds),
    restoreFocus: state.restoreFocus,
    sectionIds: state.sectionIds,
  };
}

function WorkspaceSelectionActionDialog({
  dialogId,
  onAction,
  onDismiss,
  plan,
  state,
}: Readonly<{
  dialogId: string;
  onAction(actionId: WorkspaceSelectionActionId): void;
  onDismiss(): void;
  plan: WorkspaceSelectionActionPlan | null;
  state: SelectionActionMenuState | null;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemRefs = useRef(new Map<WorkspaceSelectionActionId, HTMLButtonElement>());
  const [activeId, setActiveId] = useState<WorkspaceSelectionActionId | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!state || !plan) {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    setFeedback("");
    const firstAction =
      plan.actions.find(({ disabledReason }) => !disabledReason) ?? plan.actions[0];
    if (!firstAction) {
      return;
    }
    setActiveId(firstAction.id);
    if (!dialog.open) {
      dialog.showModal();
    }
    positionMenu(dialog, state.anchor, state.canvasElement);
    itemRefs.current.get(firstAction.id)?.focus({ preventScroll: true });
  }, [plan, state]);

  const moveFocus = (direction: "end" | "next" | "previous" | "start") => {
    if (!plan || plan.actions.length === 0) {
      return;
    }
    const currentIndex = plan.actions.findIndex(({ id }) => id === activeId);
    const nextIndex =
      direction === "start"
        ? 0
        : direction === "end"
          ? plan.actions.length - 1
          : (currentIndex + (direction === "next" ? 1 : -1) + plan.actions.length) %
            plan.actions.length;
    const action = plan.actions[nextIndex];
    if (action) {
      setActiveId(action.id);
      itemRefs.current.get(action.id)?.focus({ preventScroll: true });
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      dialogRef.current?.close();
      return;
    }
    const direction =
      event.key === "ArrowDown"
        ? "next"
        : event.key === "ArrowUp"
          ? "previous"
          : event.key === "Home"
            ? "start"
            : event.key === "End"
              ? "end"
              : null;
    if (direction) {
      event.preventDefault();
      moveFocus(direction);
    }
  };

  const actionsById = new Map(plan?.actions.map((action) => [action.id, action]) ?? []);
  return (
    <dialog
      aria-labelledby={`${dialogId}-title`}
      className={`setta-workspace__selection-action-dialog ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-local-shortcuts=""
      data-workspace-selection-action-menu=""
      id={dialogId}
      onClose={onDismiss}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
      ref={dialogRef}
    >
      <div className="setta-workspace__selection-action-surface">
        <div className="setta-workspace__selection-action-heading-row">
          <div className="setta-workspace__selection-action-heading">
            <p id={`${dialogId}-summary`}>{plan?.summary ?? "No sections selected"}</p>
            <h2 id={`${dialogId}-title`}>Selection actions</h2>
          </div>
          <button
            aria-label="Close selection actions"
            className="setta-workspace__selection-action-close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div aria-label="Selection actions" onKeyDown={handleMenuKeyDown} role="menu" tabIndex={-1}>
          {actionGroups.map((group, groupIndex) => (
            <div
              aria-label={["Locking", "Stacking", "Grouping", "Structure"][groupIndex] ?? "Actions"}
              className="setta-workspace__selection-action-group"
              key={group.join("-")}
              role="group"
            >
              {group.map((actionId) => {
                const action = actionsById.get(actionId);
                if (!action) {
                  return null;
                }
                const reasonId = `${dialogId}-${action.id}-reason`;
                return (
                  <button
                    aria-describedby={action.disabledReason ? reasonId : undefined}
                    aria-disabled={action.disabledReason ? "true" : undefined}
                    data-workspace-selection-action={action.id}
                    key={action.id}
                    onClick={() => {
                      if (action.disabledReason) {
                        setFeedback(action.disabledReason);
                        return;
                      }
                      onAction(action.id);
                      dialogRef.current?.close();
                    }}
                    onFocus={() => setActiveId(action.id)}
                    ref={(element) => {
                      if (element) {
                        itemRefs.current.set(action.id, element);
                      } else {
                        itemRefs.current.delete(action.id);
                      }
                    }}
                    role="menuitem"
                    tabIndex={activeId === action.id ? 0 : -1}
                    type="button"
                  >
                    <span>{action.label}</span>
                    {action.disabledReason ? (
                      <span className="setta-workspace__selection-action-reason" id={reasonId}>
                        {action.disabledReason}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p aria-live="polite" className="setta-workspace__visually-hidden">
          {feedback}
        </p>
      </div>
    </dialog>
  );
}

export function useWorkspaceSelectionActionMenu<TSectionData = WorkspaceJsonValue>({
  controller,
  detachedSectionIds,
  document,
  groupingConfigured,
  layoutEditable,
  onSelectionRequest,
  presentationEditable,
  selectedSectionIdsRef,
  structureEditable,
  visibleSectionIds,
}: Readonly<{
  controller: WorkspaceController<TSectionData>;
  detachedSectionIds: readonly string[];
  document: WorkspaceDocument<TSectionData>;
  groupingConfigured: boolean;
  layoutEditable: boolean;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  presentationEditable: boolean;
  selectedSectionIdsRef: RefObject<readonly string[]>;
  structureEditable: boolean;
  visibleSectionIds: readonly string[];
}>) {
  const reactId = useId().replaceAll(":", "");
  const dialogId = `setta-workspace-selection-actions-${reactId}`;
  const documentRef = useRef<WorkspaceDocument<TSectionData>>(document);
  const restoreAfterCloseRef = useRef(true);
  const pendingRef = useRef<PendingSelectionAction | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<SelectionActionMenuState | null>(null);
  const capabilities = useMemo(
    () => ({
      editLayout: layoutEditable,
      editPresentation: presentationEditable,
      editStructure: structureEditable,
    }),
    [layoutEditable, presentationEditable, structureEditable],
  );
  documentRef.current = document;

  const plan = useMemo(() => {
    const visible = new Set(visibleSectionIds);
    if (
      !state ||
      state.sectionIds.some(
        (sectionId) => !Object.hasOwn(document.sections, sectionId) || !visible.has(sectionId),
      )
    ) {
      return null;
    }
    return planWorkspaceSelectionActions(document, state.sectionIds, capabilities, {
      detachedSectionIds,
      groupingConfigured,
    });
  }, [capabilities, detachedSectionIds, document, groupingConfigured, state, visibleSectionIds]);

  const open = useCallback(
    (
      sectionId: string,
      anchor: ClientPoint,
      restoreFocus: HTMLElement,
      canvasElement: HTMLElement,
    ) => {
      onSelectionRequest(sectionId, { additive: false, preserveSelected: true });
      const selectedSectionIds = selectedSectionIdsRef.current;
      const nextPlan = planWorkspaceSelectionActions(
        documentRef.current,
        selectedSectionIds,
        capabilities,
        { detachedSectionIds, groupingConfigured },
      );
      if (nextPlan.sectionIds.length === 0) {
        return;
      }
      setState({ anchor, canvasElement, restoreFocus, sectionIds: nextPlan.sectionIds });
    },
    [
      capabilities,
      detachedSectionIds,
      groupingConfigured,
      onSelectionRequest,
      selectedSectionIdsRef,
    ],
  );

  const handleCanvasContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = eventTargetElement(event.target, event.currentTarget.ownerDocument);
      const sectionFrame = target ? selectionContextTarget(target) : null;
      const sectionId = sectionFrame?.dataset.workspaceSectionId;
      if (!target || !sectionFrame || !sectionId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open(
        sectionId,
        pointerAnchor(event, sectionFrame),
        contextRestoreFocus(target, sectionFrame),
        event.currentTarget,
      );
    },
    [open],
  );

  const handleCanvasKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!keyboardContextShortcut(event)) {
        return;
      }
      const context = keyboardSelectionContext(event);
      if (!context) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open(context.sectionId, keyboardAnchor(context.target), context.target, event.currentTarget);
    },
    [open],
  );

  const dismiss = useCallback(() => {
    const restoreFocus = state?.restoreFocus ?? null;
    setState(null);
    if (restoreAfterCloseRef.current) {
      focusElement(restoreFocus, state?.canvasElement ?? null);
    }
    restoreAfterCloseRef.current = true;
  }, [state]);

  const runAction = useCallback(
    (actionId: WorkspaceSelectionActionId) => {
      if (!state) {
        return;
      }
      const currentDocument = documentRef.current;
      const pending = pendingAction(currentDocument, actionId, state);
      const result = actionResult(
        controller as WorkspaceController<unknown>,
        actionId,
        state.sectionIds,
      );
      if (result.status === "applied") {
        pendingRef.current = pending;
        restoreAfterCloseRef.current = false;
      } else {
        pendingRef.current = null;
        setAnnouncementText(rejectedActionText(result, actionId));
      }
      setRevision((current) => current + 1);
    },
    [controller, state],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    const accepted = pendingActionAccepted(document, pending);
    setAnnouncementText(
      accepted
        ? completedActionText(pending.actionId, pending.sectionIds.length)
        : declinedActionText(pending.sectionIds.length),
    );
    pendingRef.current = null;
    if (!accepted || !actionOwnsResultingFocus(pending.actionId)) {
      focusElement(pending.restoreFocus, pending.canvasElement);
    }
  }, [document, revision]);

  return {
    announcementText,
    dialog: (
      <WorkspaceSelectionActionDialog
        dialogId={dialogId}
        onAction={runAction}
        onDismiss={dismiss}
        plan={plan}
        state={plan ? state : null}
      />
    ),
    handleCanvasContextMenuCapture,
    handleCanvasKeyDownCapture,
  };
}
