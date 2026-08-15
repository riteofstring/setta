import {
  createWorkspaceCodeSectionData,
  createWorkspaceTextSectionData,
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  GROUP_SECTION_KIND,
  registerWorkspaceCommands,
  registerWorkspaceCreationCommands,
  registerWorkspaceKeyBindings,
  registerWorkspaceToolbarContributions,
  ungroupSections,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceCommandIconProps,
  type WorkspaceCreationContext,
  type WorkspaceKeyBinding,
  type WorkspaceSectionInput,
} from "@setta/workspace";
import { useSyncExternalStore } from "react";

const INITIAL_MENU_EXTENSION_STATUS = "No host menu action invoked.";

let menuExtensionStatus = INITIAL_MENU_EXTENSION_STATUS;
let toolbarHighlightEnabled = false;
// Every host command reads one of these two values, so one version stands for "the state behind
// this host's commands changed".
let hostCommandStateVersion = 0;
const menuExtensionListeners = new Set<() => void>();

function publishHostCommandState(): void {
  hostCommandStateVersion += 1;
  for (const listener of menuExtensionListeners) {
    listener();
  }
}

function publishMenuExtensionStatus(status: string): void {
  menuExtensionStatus = status;
  publishHostCommandState();
}

function subscribeMenuExtensionStatus(listener: () => void): () => void {
  menuExtensionListeners.add(listener);
  return () => menuExtensionListeners.delete(listener);
}

function getMenuExtensionStatus(): string {
  return menuExtensionStatus;
}

function getHostCommandStateVersion(): number {
  return hostCommandStateVersion;
}

// A contributed toolbar control paints host-owned command state, so the host re-renders the tree
// the workspace is in when that state changes — the same thing this host does for its own chrome.
// Subscribed where the workspace is mounted rather than inside the readout, which is a leaf beside
// it and would repaint only itself.
export function usePlaygroundHostCommandState(): void {
  useSyncExternalStore(
    subscribeMenuExtensionStatus,
    getHostCommandStateVersion,
    getHostCommandStateVersion,
  );
}

function PlaygroundHighlightIcon({ className }: WorkspaceCommandIconProps) {
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
      <path d="M8 2.5 9.7 6l3.8.5-2.8 2.6.7 3.7L8 11.1 4.6 12.8l.7-3.7L2.5 6.5 6.3 6z" />
    </svg>
  );
}

function PlaygroundClearIcon({ className }: WorkspaceCommandIconProps) {
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
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" />
    </svg>
  );
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

// Whether the built-in code section appears in a creation surface is the host's call: this one
// lists it beside its own two kinds, on its own chord, built from the package's creation defaults.
function createPlaygroundCodeSection(context: WorkspaceCreationContext): WorkspaceSectionInput {
  return {
    id: `playground-code-${crypto.randomUUID()}`,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "Code editor",
    data: createWorkspaceCodeSectionData({
      code: `# Code editor created ${describeCreationRequest(context)}.\n`,
    }),
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

// The built-in Text section joins the same catalog, created in the format this host wants and in
// the reference's Edit-first display mode.
function createPlaygroundTextSection(context: WorkspaceCreationContext): WorkspaceSectionInput {
  return {
    id: `playground-text-${crypto.randomUUID()}`,
    kind: WORKSPACE_TEXT_SECTION_KIND,
    name: "Notes",
    data: createWorkspaceTextSectionData({
      format: "markdown",
      text: `# Notes\n\nCreated ${describeCreationRequest(context)}.\n`,
    }),
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
    {
      id: "playground-code-editor",
      label: "Code editor",
      group: "Playground",
      chord: "C",
      createSection: createPlaygroundCodeSection,
    },
    {
      id: "playground-text-section",
      label: "Notes",
      group: "Playground",
      chord: "T",
      createSection: createPlaygroundTextSection,
    },
  ]);
  registerWorkspaceCommands([
    {
      id: "playground-pane-position",
      scope: "pane",
      surfaces: ["context-menu"],
      label: "Report position",
      run: (context) => {
        const position = context.workspacePosition;
        publishMenuExtensionStatus(
          position
            ? `Pane action at ${Math.round(position.x)}, ${Math.round(position.y)}.`
            : "Pane action with no pointer position.",
        );
      },
    },
    // Two toolbar controls beside the package's own: a toggle whose pressed state the package
    // paints from the command, and an action that refuses with a sentence until there is
    // something to clear.
    {
      id: "playground-toolbar-highlight",
      scope: "pane",
      surfaces: ["context-menu", "toolbar"],
      label: "Highlight host controls",
      isChecked: () => toolbarHighlightEnabled,
      run: () => {
        toolbarHighlightEnabled = !toolbarHighlightEnabled;
        publishMenuExtensionStatus(
          `Host control highlight ${toolbarHighlightEnabled ? "on" : "off"}.`,
        );
      },
    },
    {
      id: "playground-toolbar-clear-status",
      scope: "pane",
      surfaces: ["toolbar"],
      label: "Clear host action status",
      getDisabledReason: () =>
        menuExtensionStatus === INITIAL_MENU_EXTENSION_STATUS
          ? "There is no host action status to clear yet."
          : null,
      run: () => publishMenuExtensionStatus(INITIAL_MENU_EXTENSION_STATUS),
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
  // The creation control runs the same operation as the pane menu's "Host note" entry and the "N"
  // chord, so the toolbar creates in empty space and travels to the section when it had to land
  // out of sight.
  registerWorkspaceToolbarContributions([
    {
      kind: "creation",
      commandId: "playground-note",
      icon: PlaygroundCreationIcon,
      placement: "before-viewport",
      description: "Add a host note in empty space",
    },
    {
      kind: "command",
      commandId: "playground-toolbar-highlight",
      icon: PlaygroundHighlightIcon,
      placement: "before-minimap",
    },
    {
      kind: "command",
      commandId: "playground-toolbar-clear-status",
      icon: PlaygroundClearIcon,
      placement: "before-minimap",
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
