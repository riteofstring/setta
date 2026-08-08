import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { WorkspaceController, WorkspaceJsonValue, WorkspacePoint } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  filterWorkspaceSectionDefinitions,
  groupWorkspaceSectionDefinitions,
} from "./workspace-section-creation.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

type ClientPoint = Readonly<{ x: number; y: number }>;
type PaneContextMenuEvent = MouseEvent | ReactMouseEvent<Element>;

type CreationMenuState = Readonly<{
  anchor: ClientPoint | null;
  position: WorkspacePoint | null;
  restoreFocus: HTMLElement | null;
  source: "context" | "palette";
}>;

function activeElement(trigger: HTMLElement): HTMLElement | null {
  const active = trigger.ownerDocument.activeElement;
  const ElementConstructor = trigger.ownerDocument.defaultView?.HTMLElement;
  return ElementConstructor && active instanceof ElementConstructor ? active : null;
}

function eventTargetElement(event: PaneContextMenuEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Node)) {
    return null;
  }
  const ElementConstructor = target.ownerDocument?.defaultView?.HTMLElement;
  return ElementConstructor && target instanceof ElementConstructor ? target : null;
}

function isCreationContextShortcut(event: ReactKeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

function creationContextTarget(event: ReactKeyboardEvent): HTMLElement | null {
  const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.HTMLElement;
  const target = event.target;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) {
    return null;
  }
  if (target.closest("button, input, select, textarea, [contenteditable='true']")) {
    return null;
  }
  return target;
}

function rejectionMessage(reason: string): string {
  if (reason === "structure-edit-disabled") {
    return "Section creation is disabled for this workspace.";
  }
  if (reason === "section-id-exists") {
    return "That section ID is already in use. Choose the section type again.";
  }
  if (reason === "canvas-unavailable") {
    return "The canvas is not ready. Close this picker and try again.";
  }
  return "This section type is no longer available.";
}

function positionDialog(dialog: HTMLDialogElement, anchor: ClientPoint | null): void {
  dialog.style.removeProperty("left");
  dialog.style.removeProperty("top");
  if (!anchor) {
    return;
  }
  const view = dialog.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const margin = 12;
  const bounds = dialog.getBoundingClientRect();
  const left = Math.max(margin, Math.min(anchor.x, view.innerWidth - bounds.width - margin));
  const top = Math.max(margin, Math.min(anchor.y, view.innerHeight - bounds.height - margin));
  dialog.style.left = `${String(left)}px`;
  dialog.style.top = `${String(top)}px`;
}

function WorkspaceSectionCreationDialog<TSectionData>({
  controller,
  dialogId,
  onDismiss,
  onCreated,
  registry,
  state,
}: Readonly<{
  controller: WorkspaceController<TSectionData>;
  dialogId: string;
  onDismiss(): void;
  onCreated(): void;
  registry: WorkspaceSectionRegistry<TSectionData>;
  state: CreationMenuState | null;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const definitions = registry.definitions();
  const filteredDefinitions = useMemo(
    () => filterWorkspaceSectionDefinitions(definitions, query),
    [definitions, query],
  );
  const groups = useMemo(
    () => groupWorkspaceSectionDefinitions(filteredDefinitions),
    [filteredDefinitions],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!state) {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    setQuery("");
    setError("");
    if (!dialog.open) {
      dialog.showModal();
    }
    positionDialog(dialog, state.anchor);
    searchRef.current?.focus();
  }, [state]);

  const createSection = (kind: string) => {
    const result = controller.createSection(
      kind,
      state?.position ? { position: state.position } : undefined,
    );
    if (result.status === "rejected") {
      setError(rejectionMessage(result.reason));
      searchRef.current?.focus();
      return;
    }
    onCreated();
    dialogRef.current?.close();
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialogRef.current?.close();
      return;
    }
    if (event.key !== "ArrowDown") {
      return;
    }
    const firstResult = resultsRef.current?.querySelector<HTMLButtonElement>("button");
    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
  };

  return (
    <dialog
      aria-labelledby={`${dialogId}-title`}
      className={`setta-workspace__creation-dialog ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-creation-source={state?.source}
      id={dialogId}
      onClose={onDismiss}
      ref={dialogRef}
    >
      <div className="setta-workspace__creation-surface">
        <div className="setta-workspace__creation-heading">
          <div>
            <p className="setta-workspace__creation-eyebrow">Section library</p>
            <h2 id={`${dialogId}-title`}>Add a section</h2>
          </div>
          <button
            aria-label="Close section picker"
            className="setta-workspace__creation-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <label className="setta-workspace__creation-search">
          Search sections
          <input
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setError("");
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Name or keyword"
            ref={searchRef}
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>
        <p
          aria-live="polite"
          className="setta-workspace__visually-hidden"
          data-workspace-creation-results-status=""
        >
          {`${String(filteredDefinitions.length)} section ${filteredDefinitions.length === 1 ? "type" : "types"} available.`}
        </p>
        {error ? <p className="setta-workspace__creation-error">{error}</p> : null}
        <div className="setta-workspace__creation-results" ref={resultsRef}>
          {groups.map((group) => (
            <section className="setta-workspace__creation-group" key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.definitions.map((definition) => (
                  <li key={definition.kind}>
                    <button type="button" onClick={() => createSection(definition.kind)}>
                      {definition.creation.icon ? (
                        <span aria-hidden="true" className="setta-workspace__creation-icon">
                          {definition.creation.icon}
                        </span>
                      ) : null}
                      <span>{definition.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filteredDefinitions.length === 0 ? (
            <div className="setta-workspace__creation-empty">
              <p>
                {query.trim()
                  ? `No section types match “${query.trim()}”.`
                  : "No section types available."}
              </p>
              {query.trim() ? (
                <button type="button" onClick={() => setQuery("")}>
                  Clear search
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

export function useWorkspaceSectionCreationMenu<TSectionData = WorkspaceJsonValue>({
  controller,
  creationReconciliation,
  enabled,
  geometry,
  registry,
}: Readonly<{
  controller: WorkspaceController<TSectionData>;
  creationReconciliation: Readonly<{ accepted: boolean; revision: number }>;
  enabled: boolean;
  geometry: WorkspaceGeometryMeasurements;
  registry: WorkspaceSectionRegistry<TSectionData>;
}>) {
  const reactId = useId();
  const dialogId = `setta-workspace-creation-${reactId.replaceAll(":", "")}`;
  const lastClientPointRef = useRef<ClientPoint | null>(null);
  const pendingCreatedRestoreFocusRef = useRef<HTMLElement | null>(null);
  const restoreAfterCloseRef = useRef(true);
  const [state, setState] = useState<CreationMenuState | null>(null);
  const available = enabled && registry.definitions().length > 0;

  useEffect(() => {
    if (!available) {
      setState(null);
    }
  }, [available]);
  useEffect(() => {
    if (creationReconciliation.revision === 0) {
      return;
    }
    const restoreFocus = pendingCreatedRestoreFocusRef.current;
    pendingCreatedRestoreFocusRef.current = null;
    if (!creationReconciliation.accepted) {
      restoreFocus?.focus({ preventScroll: true });
    }
  }, [creationReconciliation]);

  const dismiss = useCallback(() => {
    const restoreFocus = state?.restoreFocus;
    setState(null);
    if (restoreAfterCloseRef.current) {
      restoreFocus?.focus({ preventScroll: true });
    }
    restoreAfterCloseRef.current = true;
  }, [state]);
  const created = useCallback(() => {
    pendingCreatedRestoreFocusRef.current = state?.restoreFocus ?? null;
    restoreAfterCloseRef.current = false;
  }, [state]);
  const openPalette = useCallback(
    (trigger: HTMLButtonElement) => {
      if (!available) {
        return;
      }
      setState({
        anchor: null,
        position: null,
        restoreFocus: activeElement(trigger),
        source: "palette",
      });
    },
    [available],
  );
  const openContext = useCallback(
    (clientPoint: ClientPoint, restoreFocus: HTMLElement | null) => {
      if (!available) {
        return;
      }
      setState({
        anchor: clientPoint,
        position: geometry.clientPointToWorkspace(clientPoint),
        restoreFocus,
        source: "context",
      });
    },
    [available, geometry],
  );
  const handlePaneContextMenu = useCallback(
    (event: PaneContextMenuEvent) => {
      if (!available) {
        return;
      }
      event.preventDefault();
      openContext({ x: event.clientX, y: event.clientY }, eventTargetElement(event));
    },
    [available, openContext],
  );
  const handlePointerMoveCapture = useCallback((event: ReactPointerEvent) => {
    lastClientPointRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const handleCanvasKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!available || !isCreationContextShortcut(event)) {
        return;
      }
      const target = creationContextTarget(event);
      if (!target) {
        return;
      }
      event.preventDefault();
      const canvas = geometry.canvasBounds();
      const point = lastClientPointRef.current ?? {
        x: canvas.x + canvas.width / 2,
        y: canvas.y + canvas.height / 2,
      };
      openContext(point, target);
    },
    [available, geometry, openContext],
  );

  return {
    available,
    dialog: (
      <WorkspaceSectionCreationDialog
        controller={controller}
        dialogId={dialogId}
        onDismiss={dismiss}
        onCreated={created}
        registry={registry}
        state={state}
      />
    ),
    dialogId,
    handleCanvasKeyDownCapture,
    handlePaneContextMenu,
    handlePointerMoveCapture,
    openPalette,
  };
}
