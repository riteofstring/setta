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
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  planWorkspaceRootStacking,
  workspaceRootStackingMatches,
} from "./workspace-root-stacking.js";
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
  restoreFocus: HTMLElement;
  sectionIds: readonly string[];
}>;

const actionGroups = [
  ["lock", "unlock"],
  ["bring-to-front", "bring-forward", "send-backward", "send-to-back"],
  ["group", "ungroup"],
  ["delete"],
] as const satisfies readonly (readonly WorkspaceSelectionActionId[])[];

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
    lock: "locked",
    "send-backward": "moved backward",
    "send-to-back": "sent to back",
    unlock: "unlocked",
  };
  return `${subject} ${completion[actionId] ?? "updated"}.`;
}

function declinedActionText(count: number): string {
  return `${selectedSubject(count)} ${count === 1 ? "remains" : "remain"} unchanged because the host did not accept the action.`;
}

function rejectedActionText(result: WorkspaceActionResult): string {
  if (result.status !== "rejected") {
    return "The selected sections are already in that state.";
  }
  if (result.reason === "layout-edit-disabled") {
    return "Unable to update the selected sections. Turn on layout editing and try again.";
  }
  if (result.reason === "structure-edit-disabled") {
    return "Unable to update the selected sections. Turn on structure editing and try again.";
  }
  return "Unable to update the selected sections.";
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
  return pending.expectedRootIds
    ? workspaceRootStackingMatches(
        document.rootSections,
        pending.expectedRootIds.map((sectionId) => ({ position: { x: 0, y: 0 }, sectionId })),
      )
    : false;
}

function actionResult(
  controller: WorkspaceController<unknown>,
  actionId: WorkspaceSelectionActionId,
  sectionIds: readonly string[],
): WorkspaceActionResult {
  if (actionId === "lock" || actionId === "unlock") {
    return controller.setSectionsLocked(sectionIds, actionId === "lock");
  }
  if (actionId === "delete") {
    return controller.deleteSections(sectionIds);
  }
  if (actionId === "bring-to-front") {
    return controller.bringToFront(sectionIds);
  }
  if (actionId === "bring-forward") {
    return controller.bringForward(sectionIds);
  }
  if (actionId === "send-backward") {
    return controller.sendBackward(sectionIds);
  }
  if (actionId === "send-to-back") {
    return controller.sendToBack(sectionIds);
  }
  throw new Error(`Workspace selection action ${actionId} is unavailable.`);
}

function pendingAction(
  document: WorkspaceDocument<unknown>,
  actionId: WorkspaceSelectionActionId,
  state: SelectionActionMenuState,
): PendingSelectionAction {
  const stackingAction =
    actionId === "bring-forward" ||
    actionId === "bring-to-front" ||
    actionId === "send-backward" ||
    actionId === "send-to-back"
      ? actionId
      : null;
  return {
    actionId,
    canvasElement: state.canvasElement,
    expectedLocked: actionId === "lock" ? true : actionId === "unlock" ? false : undefined,
    expectedRootIds: stackingAction
      ? planWorkspaceRootStacking(document, state.sectionIds, stackingAction).map(
          ({ sectionId }) => sectionId,
        )
      : undefined,
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
  document,
  layoutEditable,
  onSelectionRequest,
  presentationEditable,
  selectedSectionIdsRef,
  structureEditable,
}: Readonly<{
  controller: WorkspaceController<TSectionData>;
  document: WorkspaceDocument<TSectionData>;
  layoutEditable: boolean;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  presentationEditable: boolean;
  selectedSectionIdsRef: RefObject<readonly string[]>;
  structureEditable: boolean;
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
    if (
      !state ||
      state.sectionIds.some((sectionId) => !Object.hasOwn(document.sections, sectionId))
    ) {
      return null;
    }
    return planWorkspaceSelectionActions(document, state.sectionIds, capabilities);
  }, [capabilities, document, state]);

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
      );
      if (nextPlan.sectionIds.length === 0) {
        return;
      }
      setState({ anchor, canvasElement, restoreFocus, sectionIds: nextPlan.sectionIds });
    },
    [capabilities, onSelectionRequest, selectedSectionIdsRef],
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
        setAnnouncementText(rejectedActionText(result));
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
    focusElement(pending.restoreFocus, pending.canvasElement);
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
