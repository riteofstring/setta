import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  validateWorkspaceViewportPresets,
  type WorkspaceController,
  type WorkspaceJsonValue,
  type WorkspaceViewport,
  type WorkspaceViewportPreset,
} from "../core.js";

export type WorkspaceViewportPresetCreateRequest = Readonly<{
  name: string;
  viewport: WorkspaceViewport;
}>;

export type WorkspaceViewportPresetRenameRequest = Readonly<{
  name: string;
  presetId: string;
}>;

export type WorkspaceViewportPresetsProps<TSectionData = WorkspaceJsonValue> = Omit<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "children"
> &
  Readonly<{
    ariaLabel?: string;
    controller: WorkspaceController<TSectionData>;
    emptyState?: ReactNode;
    heading?: string;
    onCreatePreset?(request: WorkspaceViewportPresetCreateRequest): void;
    onDeletePreset?(presetId: string): void;
    onRenamePreset?(request: WorkspaceViewportPresetRenameRequest): void;
    presets: readonly WorkspaceViewportPreset[];
  }>;

type PendingPresetMutation =
  | Readonly<{
      existingIds: ReadonlySet<string>;
      request: WorkspaceViewportPresetCreateRequest;
      type: "create";
    }>
  | Readonly<{
      fallbackPresetId: string | null;
      presetId: string;
      presetName: string;
      type: "delete";
    }>
  | Readonly<{
      request: WorkspaceViewportPresetRenameRequest;
      type: "rename";
    }>;

type FocusRequest = Readonly<
  { id: string; revision: number; type: "preset" } | { revision: number; type: "create" }
>;

type AcceptedPresetMutation =
  | Readonly<{ preset: WorkspaceViewportPreset; type: "create" }>
  | Readonly<{ preset: WorkspaceViewportPreset; type: "rename" }>
  | Readonly<{ fallbackPresetId: string | null; presetName: string; type: "delete" }>;

const viewportBoundsError =
  "Workspace viewport zoom must be within the configured gesture zoom bounds.";

function assertNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertOptionalCallback(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function.`);
  }
}

function normalizedPresetName(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function workspaceViewportsMatch(left: WorkspaceViewport, right: WorkspaceViewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function formattedViewportNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function viewportPresetSummary(viewport: WorkspaceViewport): string {
  return `${formattedViewportNumber(viewport.zoom * 100)}% · x ${formattedViewportNumber(viewport.x)} · y ${formattedViewportNumber(viewport.y)}`;
}

function acceptedCreatedPreset(
  pending: Extract<PendingPresetMutation, { type: "create" }>,
  presets: readonly WorkspaceViewportPreset[],
): Extract<AcceptedPresetMutation, { type: "create" }> | null {
  const preset = presets.find(
    (candidate) =>
      !pending.existingIds.has(candidate.id) &&
      candidate.name === pending.request.name &&
      workspaceViewportsMatch(candidate.viewport, pending.request.viewport),
  );
  return preset ? { preset, type: "create" } : null;
}

function acceptedRenamedPreset(
  pending: Extract<PendingPresetMutation, { type: "rename" }>,
  presets: readonly WorkspaceViewportPreset[],
): Extract<AcceptedPresetMutation, { type: "rename" }> | null {
  const preset = presets.find(({ id }) => id === pending.request.presetId);
  return preset?.name === pending.request.name ? { preset, type: "rename" } : null;
}

function acceptedDeletedPreset(
  pending: Extract<PendingPresetMutation, { type: "delete" }>,
  presets: readonly WorkspaceViewportPreset[],
): Extract<AcceptedPresetMutation, { type: "delete" }> | null {
  if (presets.some(({ id }) => id === pending.presetId)) {
    return null;
  }
  const fallbackPresetId = presets.some(({ id }) => id === pending.fallbackPresetId)
    ? pending.fallbackPresetId
    : (presets[0]?.id ?? null);
  return { fallbackPresetId, presetName: pending.presetName, type: "delete" };
}

function acceptedPresetMutation(
  pending: PendingPresetMutation,
  presets: readonly WorkspaceViewportPreset[],
): AcceptedPresetMutation | null {
  if (pending.type === "create") return acceptedCreatedPreset(pending, presets);
  if (pending.type === "rename") return acceptedRenamedPreset(pending, presets);
  return acceptedDeletedPreset(pending, presets);
}

function busyAttribute(pending: boolean): true | undefined {
  return pending ? true : undefined;
}

function WorkspaceViewportPresetEditIcon() {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 20 20">
      <path d="m4.25 13.75-.5 2.5 2.5-.5 8.85-8.85a1.75 1.75 0 0 0-2.48-2.48L4.25 12.8Z" />
      <path d="m11.5 5.55 2.95 2.95" />
    </svg>
  );
}

function WorkspaceViewportPresetDeleteIcon() {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 20 20">
      <path d="M4.5 6.25h11" />
      <path d="m7.25 6.25.5-2h4.5l.5 2" />
      <path d="m6.25 6.25.6 9.5h6.3l.6-9.5" />
      <path d="M8.5 8.75v4.5M11.5 8.75v4.5" />
    </svg>
  );
}

function usePresetFocus() {
  const createInputRef = useRef<HTMLInputElement>(null);
  const presetButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusRevisionRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.type === "create") createInputRef.current?.focus();
    else presetButtonsRef.current.get(focusRequest.id)?.focus();
  }, [focusRequest]);

  const requestCreateFocus = () => {
    focusRevisionRef.current += 1;
    setFocusRequest({ revision: focusRevisionRef.current, type: "create" });
  };
  const requestPresetFocus = (id: string) => {
    focusRevisionRef.current += 1;
    setFocusRequest({ id, revision: focusRevisionRef.current, type: "preset" });
  };
  const registerPresetButton = (id: string, element: HTMLButtonElement | null) => {
    if (element) presetButtonsRef.current.set(id, element);
    else presetButtonsRef.current.delete(id);
  };
  return {
    createInputRef,
    registerPresetButton,
    requestCreateFocus,
    requestPresetFocus,
  };
}

export function WorkspaceViewportPresets<TSectionData = WorkspaceJsonValue>({
  ariaLabel = "Saved workspace views",
  className,
  controller,
  emptyState = "No saved views yet. Save the current view to return to it later.",
  heading = "Saved views",
  onCreatePreset,
  onDeletePreset,
  onRenamePreset,
  presets,
  ...props
}: WorkspaceViewportPresetsProps<TSectionData>) {
  assertNonEmptyText(ariaLabel, "Workspace viewport presets ariaLabel");
  assertNonEmptyText(heading, "Workspace viewport presets heading");
  assertOptionalCallback(onCreatePreset, "Workspace viewport presets onCreatePreset");
  assertOptionalCallback(onDeletePreset, "Workspace viewport presets onDeletePreset");
  assertOptionalCallback(onRenamePreset, "Workspace viewport presets onRenamePreset");
  validateWorkspaceViewportPresets(presets);

  const [announcementText, setAnnouncementText] = useState("");
  const [createName, setCreateName] = useState("");
  const [createNameError, setCreateNameError] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameNameError, setRenameNameError] = useState("");
  const [mutationPending, setMutationPending] = useState(false);
  const [pendingViewport, setPendingViewport] = useState<WorkspaceViewportPreset | null>(null);
  const pendingMutationRef = useRef<PendingPresetMutation | null>(null);
  const focus = usePresetFocus();
  const createInputId = useId();
  const createErrorId = useId();
  const headingId = useId();
  const renameInputId = useId();
  const renameErrorId = useId();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const currentViewport = controller.getDocument().viewport;

  useEffect(() => {
    const pending = pendingMutationRef.current;
    if (!pending) return;
    const accepted = acceptedPresetMutation(pending, presets);
    if (!accepted) return;
    pendingMutationRef.current = null;
    setMutationPending(false);
    if (accepted.type === "create") {
      setAnnouncementText(`${accepted.preset.name} saved.`);
      setCreateName("");
      setCreateNameError("");
      focus.requestPresetFocus(accepted.preset.id);
    } else if (accepted.type === "rename") {
      setAnnouncementText(`View renamed to ${accepted.preset.name}.`);
      setEditingPresetId(null);
      setRenameNameError("");
      focus.requestPresetFocus(accepted.preset.id);
    } else {
      setAnnouncementText(`${accepted.presetName} deleted.`);
      if (accepted.fallbackPresetId) focus.requestPresetFocus(accepted.fallbackPresetId);
      else focus.requestCreateFocus();
    }
  }, [focus, presets]);

  useEffect(() => {
    if (!editingPresetId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingPresetId]);

  useEffect(() => {
    if (!pendingViewport) {
      return;
    }
    setAnnouncementText(
      workspaceViewportsMatch(currentViewport, pendingViewport.viewport)
        ? `${pendingViewport.name} restored.`
        : `${pendingViewport.name} was not restored because the host did not accept the change.`,
    );
    setPendingViewport(null);
  }, [currentViewport, pendingViewport]);

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = normalizedPresetName(createName);
    if (!name) {
      setCreateNameError("Enter a name for this view.");
      focus.createInputRef.current?.focus();
      return;
    }
    if (!onCreatePreset) return;
    if (pendingMutationRef.current) {
      setAnnouncementText("Wait for the host to finish the current saved-view change.");
      return;
    }
    const request = Object.freeze({ name, viewport: Object.freeze({ ...currentViewport }) });
    pendingMutationRef.current = {
      existingIds: new Set(presets.map(({ id }) => id)),
      request,
      type: "create",
    };
    setMutationPending(true);
    setAnnouncementText(`Saving ${name}.`);
    onCreatePreset(request);
  };

  const submitRename = (event: FormEvent<HTMLFormElement>, preset: WorkspaceViewportPreset) => {
    event.preventDefault();
    const name = normalizedPresetName(renameName);
    if (!name) {
      setRenameNameError("Enter a name for this view.");
      renameInputRef.current?.focus();
      return;
    }
    if (name === preset.name) {
      setEditingPresetId(null);
      setRenameNameError("");
      setAnnouncementText("The view name is unchanged.");
      focus.requestPresetFocus(preset.id);
      return;
    }
    if (!onRenamePreset) return;
    if (pendingMutationRef.current) {
      setAnnouncementText("Wait for the host to finish the current saved-view change.");
      return;
    }
    const request = Object.freeze({ name, presetId: preset.id });
    pendingMutationRef.current = { request, type: "rename" };
    setMutationPending(true);
    setAnnouncementText(`Renaming ${preset.name}.`);
    onRenamePreset(request);
  };

  const cancelRename = (presetId: string) => {
    setEditingPresetId(null);
    setRenameNameError("");
    focus.requestPresetFocus(presetId);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>, presetId: string) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelRename(presetId);
  };

  const deletePreset = (preset: WorkspaceViewportPreset, index: number) => {
    if (!onDeletePreset) return;
    if (pendingMutationRef.current) {
      setAnnouncementText("Wait for the host to finish the current saved-view change.");
      return;
    }
    const fallbackPresetId = presets[index + 1]?.id ?? presets[index - 1]?.id ?? null;
    pendingMutationRef.current = {
      fallbackPresetId,
      presetId: preset.id,
      presetName: preset.name,
      type: "delete",
    };
    setMutationPending(true);
    setAnnouncementText(`Deleting ${preset.name}.`);
    onDeletePreset(preset.id);
  };

  const restorePreset = (preset: WorkspaceViewportPreset) => {
    try {
      const result = controller.setViewport({ ...preset.viewport });
      if (result.status === "unchanged") {
        setAnnouncementText(`Already at ${preset.name}.`);
        return;
      }
      if (result.status === "rejected") {
        setAnnouncementText(`Unable to restore ${preset.name}.`);
        return;
      }
      setPendingViewport(preset);
      setAnnouncementText(`Restoring ${preset.name}.`);
    } catch (error) {
      if (error instanceof TypeError && error.message === viewportBoundsError) {
        setAnnouncementText(`${preset.name} uses a zoom outside the current workspace limits.`);
        return;
      }
      throw error;
    }
  };

  const resolvedClassName = ["setta-workspace__viewport-presets", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      {...props}
      aria-busy={busyAttribute(mutationPending)}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-workspace-viewport-presets=""
    >
      <div className="setta-workspace__viewport-presets-heading">
        <h2 id={headingId}>{heading}</h2>
        <p>{String(presets.length)}</p>
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-viewport-presets-announcement=""
      >
        {announcementText}
      </div>
      {onCreatePreset ? (
        <form
          aria-label="Save current view"
          className="setta-workspace__viewport-presets-create"
          onSubmit={submitCreate}
        >
          <label htmlFor={createInputId}>View name</label>
          <input
            aria-describedby={createNameError ? createErrorId : undefined}
            aria-invalid={createNameError ? "true" : undefined}
            autoComplete="off"
            disabled={mutationPending}
            id={createInputId}
            name="workspace-viewport-preset-name"
            onChange={(event) => {
              setCreateName(event.currentTarget.value);
              if (createNameError) setCreateNameError("");
            }}
            ref={focus.createInputRef}
            type="text"
            value={createName}
          />
          {createNameError ? (
            <p className="setta-workspace__viewport-presets-error" id={createErrorId}>
              {createNameError}
            </p>
          ) : null}
          <button disabled={mutationPending} type="submit">
            Save view
          </button>
        </form>
      ) : null}
      {presets.length > 0 ? (
        <ul aria-labelledby={headingId} className="setta-workspace__viewport-presets-list">
          {presets.map((preset, index) => (
            <li className="setta-workspace__viewport-presets-item" key={preset.id}>
              {editingPresetId === preset.id ? (
                <form
                  aria-label={`Rename ${preset.name}`}
                  className="setta-workspace__viewport-presets-rename"
                  onSubmit={(event) => submitRename(event, preset)}
                >
                  <label className="setta-workspace__visually-hidden" htmlFor={renameInputId}>
                    View name
                  </label>
                  <input
                    aria-describedby={renameNameError ? renameErrorId : undefined}
                    aria-invalid={renameNameError ? "true" : undefined}
                    autoComplete="off"
                    disabled={mutationPending}
                    id={renameInputId}
                    name="workspace-viewport-preset-rename"
                    onChange={(event) => {
                      setRenameName(event.currentTarget.value);
                      if (renameNameError) setRenameNameError("");
                    }}
                    onKeyDown={(event) => handleRenameKeyDown(event, preset.id)}
                    ref={renameInputRef}
                    type="text"
                    value={renameName}
                  />
                  {renameNameError ? (
                    <p className="setta-workspace__viewport-presets-error" id={renameErrorId}>
                      {renameNameError}
                    </p>
                  ) : null}
                  <div className="setta-workspace__viewport-presets-rename-actions">
                    <button disabled={mutationPending} type="submit">
                      Save name
                    </button>
                    <button
                      disabled={mutationPending}
                      type="button"
                      onClick={() => cancelRename(preset.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    aria-label={`Restore ${preset.name}`}
                    className="setta-workspace__viewport-presets-restore"
                    data-workspace-viewport-preset-id={preset.id}
                    onClick={() => restorePreset(preset)}
                    ref={(element) => focus.registerPresetButton(preset.id, element)}
                    type="button"
                  >
                    <span>{preset.name}</span>
                    <small aria-hidden="true">{viewportPresetSummary(preset.viewport)}</small>
                  </button>
                  {onRenamePreset ? (
                    <button
                      aria-label={`Rename ${preset.name}`}
                      className="setta-workspace__viewport-presets-icon-action"
                      disabled={mutationPending}
                      onClick={() => {
                        setEditingPresetId(preset.id);
                        setRenameName(preset.name);
                        setRenameNameError("");
                      }}
                      type="button"
                    >
                      <WorkspaceViewportPresetEditIcon />
                    </button>
                  ) : null}
                  {onDeletePreset ? (
                    <button
                      aria-label={`Delete ${preset.name}`}
                      className="setta-workspace__viewport-presets-icon-action"
                      disabled={mutationPending}
                      onClick={() => deletePreset(preset, index)}
                      type="button"
                    >
                      <WorkspaceViewportPresetDeleteIcon />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="setta-workspace__viewport-presets-empty">{emptyState}</p>
      )}
    </section>
  );
}
