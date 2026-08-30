import {
  createWorkspaceHost,
  createWorkspaceShellViewState,
  DEFAULT_META_CONTROL_SIZE,
  GROUP_SECTION_KIND,
  ItemDndContext,
  MetaControl,
  registerSectionKinds,
  registerWorkspaceCommands,
  registerWorkspaceCreationCommands,
  registerWorkspaceKeyBindings,
  registerWorkspaceToolbarContributions,
  setGroupOverflowMode,
  setWorkspaceColorMode,
  useWorkspaceAppearance,
  useWorkspaceHost,
  WorkspaceItemList,
  WorkspaceProvider,
  WorkspaceShell,
  type MetaControlDefinition,
  type WorkspaceCreationContext,
  type WorkspaceDocumentInput,
  type WorkspaceSection,
  type WorkspaceSectionInput,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
} from "@setta/workspace";
import "@setta/workspace/styles.css";
import { StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "./consumer.css";

function getNoteText(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Note section ${section.id} is missing its note data.`);
  }
  const text = data["text"];
  if (typeof text !== "string") {
    throw new Error(`Note section ${section.id} is missing its note text.`);
  }
  return text;
}

function NoteBody({ section }: { section: WorkspaceSection }) {
  return <p className="consumer-note-body">{getNoteText(section)}</p>;
}

function NoteIcon({ className }: { className?: string }) {
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
      <path d="M3 2.5h10v8L9.5 13.5H3z" />
      <path d="M9.5 13.5v-3H13" />
    </svg>
  );
}

function getPackedTimeValue(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      `Packed time section ${section.id} is missing its control data.`,
    );
  }
  const value = data["value"];
  if (typeof value !== "string") {
    throw new Error(
      `Packed time section ${section.id} is missing its string value.`,
    );
  }
  return value;
}

function PackedTimeBody({ section }: { section: WorkspaceSection }) {
  const control = {
    kind: "time",
    ariaLabel: "Packed time value",
    value: getPackedTimeValue(section),
    onValueChange: () => {},
  } satisfies MetaControlDefinition;
  return (
    <MetaControl
      sectionId={section.id}
      sectionName={section.name}
      control={control}
    />
  );
}

function PackedItemsBody({ section }: { section: WorkspaceSection }) {
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(
      `Packed item section ${section.id} is missing its item tree.`,
    );
  }
  return (
    <ItemDndContext>
      <WorkspaceItemList
        sectionId={section.id}
        listKey="main"
        topLevelItemIds={itemTree.items[itemTree.rootId]?.children ?? []}
      />
    </ItemDndContext>
  );
}

function makeNoteSection(
  id: string,
  name: string,
  text: string,
): WorkspaceSectionInput {
  return {
    id,
    kind: "note",
    name,

    data: { text },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createConsumerNote(
  context: WorkspaceCreationContext,
): WorkspaceSectionInput {
  const position = context.workspacePosition;
  return makeNoteSection(
    `consumer-note-${crypto.randomUUID()}`,
    "Created note",
    position
      ? `Created by the packed consumer at ${Math.round(position.x)}, ${Math.round(position.y)}.`
      : "Created by the packed consumer from the keyboard.",
  );
}

const consumerDocument: WorkspaceDocumentInput = {
  sections: {
    "welcome-note": makeNoteSection(
      "welcome-note",
      "Welcome note",
      "Rendered from the packed @setta/workspace artifact.",
    ),
    "notes-group": {
      id: "notes-group",
      kind: GROUP_SECTION_KIND,
      name: "Notes group",
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: true,
      tagColor: null,
      children: ["nested-note"],
      size: { width: 280, height: 180 },
    },
    "nested-note": makeNoteSection(
      "nested-note",
      "Nested note",
      "A nested note inside the group.",
    ),
    "packed-time": {
      id: "packed-time",
      kind: "packed-time",
      name: "Packed time",
      data: { value: "13:45" },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    },
    "packed-items": {
      id: "packed-items",
      kind: "packed-items",
      name: "Packed items",
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
      itemTree: {
        rootId: "packed-item-root",
        items: {
          "packed-item-root": {
            id: "packed-item-root",
            children: ["packed-item-text", "packed-item-switch"],
          },
          "packed-item-text": {
            id: "packed-item-text",
            children: [],
            presentation: {
              label: "message",
              labelEditable: true,
              control: {
                kind: "text",
                value: "Packed typed row",
                configuration: {
                  autocomplete: "off",
                  disabled: false,
                  placeholder: null,
                  singleLine: true,
                  wrapLines: false,
                },
              },
            },
          },
          "packed-item-switch": {
            id: "packed-item-switch",
            children: [],
            presentation: {
              label: "enabled",
              labelEditable: true,
              control: {
                kind: "switch",
                value: "true",
                configuration: { disabled: false },
              },
            },
          },
        },
        selectedItemIds: [],
      },
    },
  },
  topLevelSections: {
    "welcome-note": { x: 24, y: 24, w: 240, h: 140, zIndex: 0 },
    "notes-group": { x: 24, y: 232, w: null, h: null, zIndex: 1 },
    "packed-time": {
      x: 328,
      y: 24,
      w: DEFAULT_META_CONTROL_SIZE.width,
      h: DEFAULT_META_CONTROL_SIZE.height,
      zIndex: 2,
    },
    "packed-items": { x: 328, y: 144, w: 320, h: 160, zIndex: 3 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
  savedViews: null,
};

function DocumentChangeReadout() {
  const workspaceHost = useWorkspaceHost();
  const [documentChangeCount, setDocumentChangeCount] = useState(0);
  useEffect(() => {
    return workspaceHost.subscribe(() => {
      setDocumentChangeCount((count) => count + 1);
    });
  }, [workspaceHost]);
  return <>{documentChangeCount}</>;
}

let consumerMenuStatus = "No packed-consumer menu action invoked.";
const consumerMenuListeners = new Set<() => void>();

function publishConsumerMenuStatus(status: string): void {
  consumerMenuStatus = status;
  for (const listener of consumerMenuListeners) {
    listener();
  }
}

function subscribeConsumerMenuStatus(listener: () => void): () => void {
  consumerMenuListeners.add(listener);
  return () => consumerMenuListeners.delete(listener);
}

function getConsumerMenuStatus(): string {
  return consumerMenuStatus;
}

function ConsumerMenuReadout() {
  const status = useSyncExternalStore(
    subscribeConsumerMenuStatus,
    getConsumerMenuStatus,
    getConsumerMenuStatus,
  );
  return <p aria-live="polite">{status}</p>;
}

function ConsumerNotesIcon({
  className,
  ...iconProps
}: WorkspaceShellTabIconProps) {
  return (
    <svg
      {...iconProps}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <path d="M3 2.5h10v11H3z" />
      <path d="M5.5 6h5M5.5 9h5" />
    </svg>
  );
}

function ConsumerDetailsIcon({
  className,
  ...iconProps
}: WorkspaceShellTabIconProps) {
  return (
    <svg
      {...iconProps}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.25v3.5M8 5.25h.01" />
    </svg>
  );
}

const consumerLeadingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "consumer-notes",
    label: "Consumer notes",
    icon: ConsumerNotesIcon,
    renderContent: () => (
      <div className="consumer-host-pane">
        <p>
          This is host-rendered content registered through the packed public
          API.
        </p>
        <p>The package owns the surrounding pane, rail, and resize behavior.</p>
      </div>
    ),
  },
];

const consumerTrailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "consumer-details",
    label: "Consumer details",
    icon: ConsumerDetailsIcon,
    renderContent: ({ closePane }) => (
      <div className="consumer-host-pane">
        <p>
          The shell state remains controlled and serializable by this unrelated
          host.
        </p>
        <button onClick={closePane} type="button">
          Close pane
        </button>
      </div>
    ),
  },
];

function ConsumerApp() {
  const workspaceHost = useWorkspaceHost();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const [shellViewState, setShellViewState] = useState(() =>
    createWorkspaceShellViewState(),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="consumer-shell">
      <header className="consumer-header">
        <h1>Packed @setta/workspace consumer</h1>
        <button
          type="button"
          onClick={() =>
            setWorkspaceColorMode(workspaceHost, darkMode ? "light" : "dark")
          }
        >
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <button
          type="button"
          onClick={() => {
            const group = workspaceHost.getSnapshot().sections["notes-group"];
            if (!group) {
              throw new Error("The packed notes group is unavailable.");
            }
            setGroupOverflowMode(workspaceHost, group.id, !group.overflowMode);
          }}
        >
          Toggle bounded notes group
        </button>
        <p>
          <DocumentChangeReadout /> document changes reported.
        </p>
        <ConsumerMenuReadout />
      </header>
      <div className="consumer-workspace">
        <WorkspaceShell
          ariaLabel="Packed consumer workspace"
          leadingTabs={consumerLeadingTabs}
          onViewStateChange={setShellViewState}
          trailingTabs={consumerTrailingTabs}
          viewState={shellViewState}
        />
      </div>
    </main>
  );
}

const workspaceHost = createWorkspaceHost();
setWorkspaceColorMode(
  workspaceHost,
  document.documentElement.classList.contains("dark") ? "dark" : "light",
);
registerSectionKinds(workspaceHost, {
  note: {
    renderContent: (section) => <NoteBody section={section} />,
    renderInspector: (context) => (
      <p className="consumer-host-pane">
        Packed host Inspector contribution for {context.type}.
      </p>
    ),
    icon: NoteIcon,
    defaultSize: { width: 240, height: 140 },
  },
  "packed-time": {
    renderContent: (section) => <PackedTimeBody section={section} />,
    renderInspector: (context) => (
      <p className="consumer-host-pane">
        Packed host Inspector contribution for {context.type}.
      </p>
    ),
    presentation: {
      type: "meta-control",
      resolveControlKind: () => "time",
      onEdit: () => {},
    },
  },
  "packed-items": {
    renderContent: (section) => <PackedItemsBody section={section} />,
    renderInspector: (context) => (
      <p className="consumer-host-pane">
        Packed host Inspector contribution for {context.type}.
      </p>
    ),
    itemArea: { toolbar: "authoring-and-filter" },
    contentClassName: "consumer-packed-items",
    defaultSize: { width: 320, height: 160 },
  },
});
registerWorkspaceCreationCommands(workspaceHost, [
  {
    id: "consumer-note",
    label: "Packed note",
    group: "Consumer",
    chord: "N",
    icon: NoteIcon,
    createSection: createConsumerNote,
  },
]);
registerWorkspaceCommands(workspaceHost, [
  {
    id: "consumer-pane-position",
    scope: "pane",
    surfaces: ["context-menu"],
    label: "Report packed position",
    run: (context) => {
      const position = context.workspacePosition;
      publishConsumerMenuStatus(
        position
          ? `Packed pane action at ${Math.round(position.x)}, ${Math.round(position.y)}.`
          : "Packed pane action with no pointer position.",
      );
    },
  },
  {
    id: "consumer-section-selection",
    scope: "section",
    surfaces: ["context-menu", "header", "inspector"],
    label: "Report packed selection",
    run: (context) =>
      publishConsumerMenuStatus(
        `Packed section action for ${context.section.name}; ${context.selectedSections.length} selected.`,
      ),
  },
  {
    id: "consumer-item-identity",
    scope: "item",
    surfaces: ["context-menu"],
    label: "Report packed item",
    run: (context) =>
      publishConsumerMenuStatus(`Packed item action for ${context.item.id}.`),
  },
  {
    id: "consumer-outline-selection",
    scope: "section",
    surfaces: ["outline"],
    label: "Report packed Outline row",
    run: (context) =>
      publishConsumerMenuStatus(
        `Packed Outline action for ${context.section.name}.`,
      ),
  },
]);

registerWorkspaceKeyBindings(workspaceHost, [
  { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
]);

registerWorkspaceToolbarContributions(workspaceHost, [
  {
    kind: "creation",
    commandId: "consumer-note",
    icon: NoteIcon,
    placement: "before-viewport",
    description: "Add a packed note in empty space",
  },
]);
workspaceHost.loadDocument(consumerDocument);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Packed consumer root element missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceProvider host={workspaceHost}>
      <ConsumerApp />
    </WorkspaceProvider>
  </StrictMode>,
);
