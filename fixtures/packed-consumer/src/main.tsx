import {
  createWorkspaceShellViewState,
  DEFAULT_META_CONTROL_SIZE,
  GROUP_SECTION_KIND,
  ItemDndContext,
  loadWorkspaceDocument,
  MetaControl,
  registerSectionKinds,
  setWorkspaceColorMode,
  setWorkspaceDocumentChangeCallback,
  useWorkspaceAppearance,
  WorkspaceItemList,
  WorkspaceShell,
  type MetaControlDefinition,
  type WorkspaceDocumentInput,
  type WorkspaceSection,
  type WorkspaceSectionInput,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
} from "@setta/workspace";
import "@setta/workspace/styles.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./consumer.css";

// An unrelated React application consuming the locally packed @setta/workspace artifact: it
// depends only on the tarball's public exports and compiled stylesheet, registers its own
// section kinds with host renderers, opaque data, and package presentation seams, and styles its
// host chrome with plain CSS — no Tailwind, no package source, and no Setta application code.

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
  // Registration places this host content in the package-owned section body slot.
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
    throw new Error(`Packed time section ${section.id} is missing its control data.`);
  }
  const value = data["value"];
  if (typeof value !== "string") {
    throw new Error(`Packed time section ${section.id} is missing its string value.`);
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
  return <MetaControl sectionId={section.id} sectionName={section.name} control={control} />;
}

function PackedItemsBody({ section }: { section: WorkspaceSection }) {
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Packed item section ${section.id} is missing its item tree.`);
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

function makeNoteSection(id: string, name: string, text: string): WorkspaceSectionInput {
  return {
    id,
    kind: "note",
    name,
    // The note text is the kind's opaque data; the size comes from the kind's registered
    // default.
    data: { text },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
  };
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
      tagColor: null,
      children: ["nested-note"],
    },
    "nested-note": makeNoteSection("nested-note", "Nested note", "A nested note inside the group."),
    "packed-time": {
      id: "packed-time",
      kind: "packed-time",
      name: "Packed time",
      data: { value: "13:45" },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
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
};

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  setWorkspaceColorMode(next ? "dark" : "light");
}

// The host side of the document-change callback: every package-initiated canonical commit
// reports the serializable document once; the initial load never does.
function DocumentChangeReadout() {
  const [documentChangeCount, setDocumentChangeCount] = useState(0);
  useEffect(() => {
    setWorkspaceDocumentChangeCallback(() => {
      setDocumentChangeCount((count) => count + 1);
    });
    return () => setWorkspaceDocumentChangeCallback(null);
  }, []);
  return <>{documentChangeCount}</>;
}

function ConsumerNotesIcon({ className, ...iconProps }: WorkspaceShellTabIconProps) {
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

function ConsumerDetailsIcon({ className, ...iconProps }: WorkspaceShellTabIconProps) {
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
        <p>This is host-rendered content registered through the packed public API.</p>
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
        <p>The shell state remains controlled and serializable by this unrelated host.</p>
        <button onClick={closePane} type="button">
          Close pane
        </button>
      </div>
    ),
  },
];

const INITIAL_CONSUMER_LEADING_TAB_ID = "consumer-notes";
const INITIAL_CONSUMER_TRAILING_TAB_ID = "consumer-details";

function ConsumerApp() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const [shellViewState, setShellViewState] = useState(() =>
    createWorkspaceShellViewState({
      leadingTabId: INITIAL_CONSUMER_LEADING_TAB_ID,
      trailingTabId: INITIAL_CONSUMER_TRAILING_TAB_ID,
    }),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="consumer-shell">
      <header className="consumer-header">
        <h1>Packed @setta/workspace consumer</h1>
        <button type="button" onClick={toggleDarkMode}>
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <p>
          <DocumentChangeReadout /> document changes reported.
        </p>
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

// Kind registration precedes the load because loading validates section kinds against the
// registry, and the appearance store must reflect the boot appearance before node
// projection derives backgrounds from it.
setWorkspaceColorMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
registerSectionKinds({
  note: {
    renderContent: (section) => <NoteBody section={section} />,
    icon: NoteIcon,
    defaultSize: { width: 240, height: 140 },
  },
  "packed-time": {
    renderContent: (section) => <PackedTimeBody section={section} />,
    presentation: {
      type: "meta-control",
      resolveControlKind: () => "time",
      onEdit: () => {},
    },
  },
  "packed-items": {
    renderContent: (section) => <PackedItemsBody section={section} />,
    contentClassName: "consumer-packed-items",
    defaultSize: { width: 320, height: 160 },
  },
});
loadWorkspaceDocument(consumerDocument);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Packed consumer root element missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ConsumerApp />
  </StrictMode>,
);
