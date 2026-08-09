import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { WorkspaceController, WorkspaceJsonValue } from "../core.js";
import { isDenseArray, isEnumerableDataProperty } from "./runtime-option-validation.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";

export type WorkspacePanePlacement = "end" | "start";

export type WorkspacePaneRegistration<TSectionData = WorkspaceJsonValue> = Readonly<{
  icon: ReactNode;
  id: string;
  label: string;
  placement: WorkspacePanePlacement;
  render(controller: WorkspaceController<TSectionData>): ReactNode;
}>;

export type WorkspaceActivePaneChangeHandler = (paneId: string | null) => void;

export type WorkspacePaneToolbarControl = Readonly<{
  ariaControls: string;
  controlId: string;
  expanded: boolean;
  icon: ReactNode;
  label: string;
  onPress(): void;
  paneId: string;
}>;

type ResolvedWorkspacePane<TSectionData> = WorkspacePaneRegistration<TSectionData> &
  Readonly<{ panelId: string }>;

type WorkspacePaneState<TSectionData> = Readonly<{
  activePane: ResolvedWorkspacePane<TSectionData> | null;
  closeActivePane(): void;
  controls: readonly WorkspacePaneToolbarControl[];
}>;

const paneRegistrationKeys = new Set(["icon", "id", "label", "placement", "render"]);

function plainPaneRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function assertPaneRegistrationKeys(record: Record<string, unknown>): void {
  const invalidKey = Reflect.ownKeys(record).find(
    (key) =>
      typeof key !== "string" ||
      !isEnumerableDataProperty(record, key) ||
      !paneRegistrationKeys.has(key),
  );
  if (invalidKey !== undefined) {
    throw new TypeError(`Unknown workspace pane registration field ${String(invalidKey)}.`);
  }
}

function assertPaneId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty unpadded string.`);
  }
}

function assertPaneLabel(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function validateWorkspacePaneRegistration<TSectionData>(
  value: WorkspacePaneRegistration<TSectionData>,
  index: number,
): WorkspacePaneRegistration<TSectionData> {
  const label = `Workspace pane registration at index ${String(index)}`;
  const record = plainPaneRecord(value, label);
  assertPaneRegistrationKeys(record);
  assertPaneId(record.id, `${label} id`);
  assertPaneLabel(record.label, `${label} label`);
  if (record.placement !== "end" && record.placement !== "start") {
    throw new TypeError(`${label} placement must be start or end.`);
  }
  if (!Object.hasOwn(record, "icon")) {
    throw new TypeError(`${label} must provide an icon.`);
  }
  if (typeof record.render !== "function") {
    throw new TypeError(`${label} render must be a function.`);
  }
  return Object.freeze({ ...value });
}

export function resolveWorkspacePaneRegistrations<TSectionData>(
  registrations: readonly WorkspacePaneRegistration<TSectionData>[] | undefined,
): readonly WorkspacePaneRegistration<TSectionData>[] {
  if (registrations === undefined) return Object.freeze([]);
  if (!isDenseArray(registrations)) {
    throw new TypeError("Workspace pane registrations must be a dense array without extra fields.");
  }
  const resolved = registrations.map(validateWorkspacePaneRegistration);
  const ids = new Set<string>();
  for (const registration of resolved) {
    if (ids.has(registration.id)) {
      throw new TypeError(`Duplicate workspace pane id ${JSON.stringify(registration.id)}.`);
    }
    ids.add(registration.id);
  }
  return Object.freeze(resolved);
}

function assertActivePaneId(
  value: string | null | undefined,
  label: string,
  paneIds: ReadonlySet<string>,
): void {
  if (value === undefined || value === null) return;
  assertPaneId(value, label);
  if (!paneIds.has(value)) {
    throw new TypeError(`${label} ${JSON.stringify(value)} is not registered.`);
  }
}

function assertWorkspacePaneStateOptions(
  registrations: readonly WorkspacePaneRegistration<unknown>[],
  activePaneId: string | null | undefined,
  defaultActivePaneId: string | null | undefined,
  onActivePaneChange: WorkspaceActivePaneChangeHandler | undefined,
): boolean {
  const controlled = activePaneId !== undefined;
  if (onActivePaneChange !== undefined && typeof onActivePaneChange !== "function") {
    throw new TypeError("Workspace active pane change handler must be a function.");
  }
  if (controlled && defaultActivePaneId !== undefined) {
    throw new TypeError("Workspace cannot receive both activePaneId and defaultActivePaneId.");
  }
  if (controlled && onActivePaneChange === undefined) {
    throw new TypeError("A controlled Workspace pane state requires onActivePaneChange.");
  }
  const paneIds = new Set(registrations.map(({ id }) => id));
  assertActivePaneId(activePaneId, "Workspace active pane ID", paneIds);
  assertActivePaneId(defaultActivePaneId, "Workspace default active pane ID", paneIds);
  return controlled;
}

function paneControlId(paneId: string): string {
  return `workspace-pane:${paneId}`;
}

export function useWorkspacePanes<TSectionData>({
  activePaneId,
  defaultActivePaneId,
  onActivePaneChange,
  registrations,
}: Readonly<{
  activePaneId: string | null | undefined;
  defaultActivePaneId: string | null | undefined;
  onActivePaneChange: WorkspaceActivePaneChangeHandler | undefined;
  registrations: readonly WorkspacePaneRegistration<TSectionData>[];
}>): WorkspacePaneState<TSectionData> {
  const controlled = assertWorkspacePaneStateOptions(
    registrations,
    activePaneId,
    defaultActivePaneId,
    onActivePaneChange,
  );
  const initialControlledRef = useRef(controlled);
  if (initialControlledRef.current !== controlled) {
    throw new TypeError(
      "Workspace pane state cannot switch between controlled and uncontrolled usage.",
    );
  }
  const [uncontrolledPaneId, setUncontrolledPaneId] = useState(defaultActivePaneId ?? null);
  const resolvedActivePaneId = controlled ? (activePaneId ?? null) : uncontrolledPaneId;
  const registrationIds = registrations.map(({ id }) => id).join("\u0000");
  useEffect(() => {
    if (controlled || resolvedActivePaneId === null) return;
    if (registrations.some(({ id }) => id === resolvedActivePaneId)) return;
    setUncontrolledPaneId(null);
    onActivePaneChange?.(null);
  }, [controlled, onActivePaneChange, registrationIds, registrations, resolvedActivePaneId]);
  const setActivePane = useCallback(
    (nextPaneId: string | null) => {
      if (resolvedActivePaneId === nextPaneId) return;
      if (!controlled) setUncontrolledPaneId(nextPaneId);
      onActivePaneChange?.(nextPaneId);
    },
    [controlled, onActivePaneChange, resolvedActivePaneId],
  );
  const reactId = useId().replaceAll(":", "");
  const resolvedRegistrations = useMemo<readonly ResolvedWorkspacePane<TSectionData>[]>(
    () =>
      registrations.map((registration, index) => ({
        ...registration,
        panelId: `setta-workspace-${reactId}-pane-${String(index)}`,
      })),
    [reactId, registrations],
  );
  const activePane = resolvedRegistrations.find(({ id }) => id === resolvedActivePaneId) ?? null;
  const controls = useMemo<readonly WorkspacePaneToolbarControl[]>(
    () =>
      resolvedRegistrations.map((pane) => ({
        ariaControls: pane.panelId,
        controlId: paneControlId(pane.id),
        expanded: pane.id === resolvedActivePaneId,
        icon: pane.icon,
        label: pane.label,
        onPress: () => setActivePane(pane.id === resolvedActivePaneId ? null : pane.id),
        paneId: pane.id,
      })),
    [resolvedActivePaneId, resolvedRegistrations, setActivePane],
  );
  const closeActivePane = useCallback(() => setActivePane(null), [setActivePane]);
  return { activePane, closeActivePane, controls };
}

function focusWorkspacePaneTrigger(element: HTMLButtonElement, paneId: string): void {
  const workspace = element.closest<HTMLElement>("[data-setta-workspace]");
  const controls = workspace?.querySelectorAll<HTMLButtonElement>("[data-workspace-pane-trigger]");
  const trigger = [...(controls ?? [])].find(
    (candidate) => candidate.dataset.workspacePaneTrigger === paneId,
  );
  trigger?.focus();
}

function ClosePaneIcon() {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 20 20">
      <path d="m5.5 5.5 9 9m0-9-9 9" />
    </svg>
  );
}

export function WorkspacePaneLayout<TSectionData>({
  activePane,
  children,
  controller,
  onClose,
}: Readonly<{
  activePane: ResolvedWorkspacePane<TSectionData> | null;
  children: ReactNode;
  controller: WorkspaceController<TSectionData>;
  onClose(): void;
}>) {
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!activePane) return;
    onClose();
    focusWorkspacePaneTrigger(event.currentTarget, activePane.id);
  };
  return (
    <div
      className="setta-workspace__pane-layout"
      data-workspace-pane-open={activePane ? "true" : "false"}
      data-workspace-pane-placement={activePane?.placement}
    >
      <div className="setta-workspace__pane-canvas">{children}</div>
      {activePane ? (
        <aside
          aria-labelledby={`${activePane.panelId}-heading`}
          className={`setta-workspace__pane ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
          data-workspace-pane-id={activePane.id}
          data-workspace-pane-placement={activePane.placement}
          id={activePane.panelId}
        >
          <header className="setta-workspace__pane-header">
            <h2 id={`${activePane.panelId}-heading`}>{activePane.label}</h2>
            <button
              aria-label={`Close ${activePane.label}`}
              className="setta-workspace__pane-close"
              onClick={handleClose}
              type="button"
            >
              <ClosePaneIcon />
            </button>
          </header>
          <div className="setta-workspace__pane-content">{activePane.render(controller)}</div>
        </aside>
      ) : null}
    </div>
  );
}
