import {
  GROUP_SECTION_KIND,
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  registerWorkspaceCommands,
  registerWorkspaceCreationCommands,
  registerWorkspaceKeyBindings,
  ungroupSections,
  type WorkspaceCommandIconProps,
  type WorkspaceCreationContext,
  type WorkspaceKeyBinding,
  type WorkspaceSectionInput,
} from "@setta/workspace";
import { useSyncExternalStore } from "react";

let menuExtensionStatus = "No host menu action invoked.";
const menuExtensionListeners = new Set<() => void>();

function publishMenuExtensionStatus(status: string): void {
  menuExtensionStatus = status;
  for (const listener of menuExtensionListeners) {
    listener();
  }
}

function subscribeMenuExtensionStatus(listener: () => void): () => void {
  menuExtensionListeners.add(listener);
  return () => menuExtensionListeners.delete(listener);
}

function getMenuExtensionStatus(): string {
  return menuExtensionStatus;
}

function PlaygroundCreationIcon({ className }: WorkspaceCommandIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <path d="M3 2.5h10v11H3z" />
      <path d="M5.5 6h5M5.5 9h5" />
    </svg>
  );
}

// A pane-menu request carries the pointer's canvas position; a chord carries none, and the
// package places the section in empty space after this factory returns.
function describeCreationRequest(context: WorkspaceCreationContext): string {
  const position = context.workspacePosition;
  return position ? `at ${Math.round(position.x)}, ${Math.round(position.y)}` : "from the keyboard";
}

function createPlaygroundLeaf(
  context: WorkspaceCreationContext,
  variant: "note" | "marker",
): WorkspaceSectionInput {
  const id = `playground-${variant}-${crypto.randomUUID()}`;
  const label = variant === "note" ? "Host note" : "Position marker";
  return {
    id,
    kind: "leaf",
    name: label,
    data: {
      body: `${label} created ${describeCreationRequest(context)}.`,
    },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

export function registerPlaygroundMenuExtensions(): void {
  // The chords are the reference's own creation defaults, "N" and "G", over this host's catalog.
  registerWorkspaceCreationCommands([
    {
      id: "playground-note",
      label: "Host note",
      group: "Playground",
      chord: "N",
      icon: PlaygroundCreationIcon,
      createSection: (context) => createPlaygroundLeaf(context, "note"),
    },
    {
      id: "playground-marker",
      label: "Position marker",
      group: "Playground",
      chord: "G",
      createSection: (context) => createPlaygroundLeaf(context, "marker"),
    },
  ]);
  registerWorkspaceCommands([
    {
      id: "playground-pane-position",
      scope: "pane",
      surfaces: ["context-menu"],
      label: "Report position",
      run: (context) =>
        publishMenuExtensionStatus(
          `Pane action at ${Math.round(context.workspacePosition.x)}, ${Math.round(context.workspacePosition.y)}.`,
        ),
    },
    {
      id: "playground-section-selection",
      scope: "section",
      surfaces: ["context-menu", "header"],
      label: "Report selection",
      run: (context) =>
        publishMenuExtensionStatus(
          `Section action for ${context.section.name}; ${context.selectedSections.length} selected.`,
        ),
    },
    {
      id: "playground-ungroup-selection",
      scope: "section",
      surfaces: ["context-menu", "header", "inspector"],
      label: "Ungroup selection",
      getDisabledReason: (context) =>
        context.selectedSections.length === 0 ||
        context.selectedSections.some(
          (section) => section.kind !== GROUP_SECTION_KIND || section.positionAndSizeLocked,
        )
          ? "The host action needs a selection of unlocked groups."
          : null,
      getStatusMessage: () => "Selection ungrouped through the host action.",
      run: (context) => {
        ungroupSections(context.selectedSections.map((section) => section.id));
        publishMenuExtensionStatus("Selection ungrouped through the host action.");
      },
    },
    {
      id: "playground-item-identity",
      scope: "item",
      surfaces: ["context-menu"],
      label: "Report item",
      run: (context) =>
        publishMenuExtensionStatus(`Item action for ${context.section.name}/${context.item.id}.`),
    },
    {
      id: "playground-outline-selection",
      scope: "section",
      surfaces: ["outline"],
      label: "Report Outline row",
      run: (context) =>
        publishMenuExtensionStatus(
          `Outline action for ${context.section.name}; ${context.selectedSections.length} selected.`,
        ),
    },
  ]);
}

// The package ships locking bindable but unbound, so the host chooses its own chords for it.
const PLAYGROUND_KEY_BINDINGS: ReadonlyArray<WorkspaceKeyBinding> = [
  { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
  { id: "workspace.unlock-sections", chord: "Mod + Alt + U" },
];

// A chord the package already gives to grouping, kept here so the acceptance run can see what a
// host learns before it applies a rebinding.
const CONFLICTING_KEY_BINDING: WorkspaceKeyBinding = {
  id: "workspace.lock-sections",
  chord: "Mod + G",
};

export function registerPlaygroundKeyBindings(): void {
  registerWorkspaceKeyBindings(PLAYGROUND_KEY_BINDINGS);
}

export function PlaygroundShortcutList() {
  return (
    <dl className="playground-guide-list">
      {getWorkspaceKeyBindings().map((binding) => (
        <div key={binding.id}>
          <dt>{binding.label}</dt>
          <dd>{binding.chordLabel ?? "Unbound"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HostShortcutConflictAction() {
  return (
    <button
      className="playground-menu-action"
      onClick={() => {
        const conflicts = getWorkspaceKeyBindingConflicts([
          ...PLAYGROUND_KEY_BINDINGS.filter((binding) => binding.id !== CONFLICTING_KEY_BINDING.id),
          CONFLICTING_KEY_BINDING,
        ]);
        publishMenuExtensionStatus(
          conflicts
            .map(
              (conflict) =>
                `${conflict.chordLabel} is already taken by ${conflict.reservedGesture ?? conflict.bindingIds.join(" and ")}.`,
            )
            .join(" ") || "That chord is free.",
        );
      }}
      type="button"
    >
      <span>Check a conflicting shortcut</span>
      <span className="playground-menu-action-meta">Lock on Mod+G</span>
    </button>
  );
}

export function PlaygroundMenuActionReadout() {
  const status = useSyncExternalStore(
    subscribeMenuExtensionStatus,
    getMenuExtensionStatus,
    getMenuExtensionStatus,
  );
  return <span aria-live="polite">{status}</span>;
}
