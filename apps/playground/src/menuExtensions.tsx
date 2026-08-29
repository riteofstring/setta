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
  useWorkspaceHost,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceCommandIconProps,
  type WorkspaceCreationContext,
  type WorkspaceKeyBinding,
  type WorkspaceHost,
  type WorkspaceSectionInput,
} from "@setta/workspace";
import { useSyncExternalStore } from "react";

const INITIAL_MENU_EXTENSION_STATUS = "No host menu action invoked.";

type PlaygroundHostCommandState = {
  listeners: Set<() => void>;
  menuExtensionStatus: string;
  toolbarHighlightEnabled: boolean;
  version: number;
};

const hostCommandStates = new WeakMap<
  WorkspaceHost,
  PlaygroundHostCommandState
>();

function getHostCommandState(host: WorkspaceHost): PlaygroundHostCommandState {
  const existing = hostCommandStates.get(host);
  if (existing) {
    return existing;
  }
  const state: PlaygroundHostCommandState = {
    listeners: new Set(),
    menuExtensionStatus: INITIAL_MENU_EXTENSION_STATUS,
    toolbarHighlightEnabled: false,
    version: 0,
  };
  hostCommandStates.set(host, state);
  return state;
}

function publishHostCommandState(host: WorkspaceHost): void {
  const state = getHostCommandState(host);
  state.version += 1;
  for (const listener of state.listeners) {
    listener();
  }
}

function publishMenuExtensionStatus(host: WorkspaceHost, status: string): void {
  getHostCommandState(host).menuExtensionStatus = status;
  publishHostCommandState(host);
}

function subscribeMenuExtensionStatus(
  host: WorkspaceHost,
  listener: () => void,
): () => void {
  const state = getHostCommandState(host);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function getMenuExtensionStatus(host: WorkspaceHost): string {
  return getHostCommandState(host).menuExtensionStatus;
}

function getHostCommandStateVersion(host: WorkspaceHost): number {
  return getHostCommandState(host).version;
}

export function usePlaygroundHostCommandState(): void {
  const host = useWorkspaceHost();
  useSyncExternalStore(
    (listener) => subscribeMenuExtensionStatus(host, listener),
    () => getHostCommandStateVersion(host),
    () => getHostCommandStateVersion(host),
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

function describeCreationRequest(context: WorkspaceCreationContext): string {
  const position = context.workspacePosition;
  return position
    ? `at ${Math.round(position.x)}, ${Math.round(position.y)}`
    : "from the keyboard";
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

function createPlaygroundCodeSection(
  context: WorkspaceCreationContext,
): WorkspaceSectionInput {
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

function createPlaygroundTextSection(
  context: WorkspaceCreationContext,
): WorkspaceSectionInput {
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

export function registerPlaygroundMenuExtensions(host: WorkspaceHost): void {
  registerWorkspaceCreationCommands(host, [
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
  registerWorkspaceCommands(host, [
    {
      id: "playground-pane-position",
      scope: "pane",
      surfaces: ["context-menu"],
      label: "Report position",
      run: (context) => {
        const position = context.workspacePosition;
        publishMenuExtensionStatus(
          context.host,
          position
            ? `Pane action at ${Math.round(position.x)}, ${Math.round(position.y)}.`
            : "Pane action with no pointer position.",
        );
      },
    },

    {
      id: "playground-toolbar-highlight",
      scope: "pane",
      surfaces: ["context-menu", "toolbar"],
      label: "Highlight host controls",
      isChecked: (context) =>
        getHostCommandState(context.host).toolbarHighlightEnabled,
      run: (context) => {
        const state = getHostCommandState(context.host);
        state.toolbarHighlightEnabled = !state.toolbarHighlightEnabled;
        publishMenuExtensionStatus(
          context.host,
          `Host control highlight ${state.toolbarHighlightEnabled ? "on" : "off"}.`,
        );
      },
    },
    {
      id: "playground-toolbar-clear-status",
      scope: "pane",
      surfaces: ["toolbar"],
      label: "Clear host action status",
      getDisabledReason: (context) =>
        getMenuExtensionStatus(context.host) === INITIAL_MENU_EXTENSION_STATUS
          ? "There is no host action status to clear yet."
          : null,
      run: (context) =>
        publishMenuExtensionStatus(context.host, INITIAL_MENU_EXTENSION_STATUS),
    },
    {
      id: "playground-section-selection",
      scope: "section",
      surfaces: ["context-menu", "header"],
      label: "Report selection",
      run: (context) =>
        publishMenuExtensionStatus(
          context.host,
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
          (section) =>
            section.kind !== GROUP_SECTION_KIND ||
            section.positionAndSizeLocked,
        )
          ? "The host action needs a selection of unlocked groups."
          : null,
      getStatusMessage: () => "Selection ungrouped through the host action.",
      run: (context) => {
        ungroupSections(
          context.host,
          context.selectedSections.map((section) => section.id),
        );
        publishMenuExtensionStatus(
          context.host,
          "Selection ungrouped through the host action.",
        );
      },
    },
    {
      id: "playground-item-identity",
      scope: "item",
      surfaces: ["context-menu"],
      label: "Report item",
      run: (context) =>
        publishMenuExtensionStatus(
          context.host,
          `Item action for ${context.section.name}/${context.item.id}.`,
        ),
    },
    {
      id: "playground-outline-selection",
      scope: "section",
      surfaces: ["outline"],
      label: "Report Outline row",
      run: (context) =>
        publishMenuExtensionStatus(
          context.host,
          `Outline action for ${context.section.name}; ${context.selectedSections.length} selected.`,
        ),
    },
  ]);

  registerWorkspaceToolbarContributions(host, [
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

const PLAYGROUND_KEY_BINDINGS: ReadonlyArray<WorkspaceKeyBinding> = [
  { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
  { id: "workspace.unlock-sections", chord: "Mod + Alt + U" },
];

const CONFLICTING_KEY_BINDING: WorkspaceKeyBinding = {
  id: "workspace.lock-sections",
  chord: "Mod + G",
};

export function registerPlaygroundKeyBindings(host: WorkspaceHost): void {
  registerWorkspaceKeyBindings(host, PLAYGROUND_KEY_BINDINGS);
}

export function PlaygroundShortcutList() {
  const host = useWorkspaceHost();
  return (
    <dl className="playground-guide-list">
      {getWorkspaceKeyBindings(host).map((binding) => (
        <div key={binding.id}>
          <dt>{binding.label}</dt>
          <dd>{binding.chordLabel ?? "Unbound"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HostShortcutConflictAction() {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-menu-action"
      onClick={() => {
        const conflicts = getWorkspaceKeyBindingConflicts(host, [
          ...PLAYGROUND_KEY_BINDINGS.filter(
            (binding) => binding.id !== CONFLICTING_KEY_BINDING.id,
          ),
          CONFLICTING_KEY_BINDING,
        ]);
        publishMenuExtensionStatus(
          host,
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
  const host = useWorkspaceHost();
  const status = useSyncExternalStore(
    (listener) => subscribeMenuExtensionStatus(host, listener),
    () => getMenuExtensionStatus(host),
    () => getMenuExtensionStatus(host),
  );
  return <span aria-live="polite">{status}</span>;
}
